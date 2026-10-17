"""Safe extraction of validated zip members onto disk.

``safe_extract`` runs after
``_project_import_validation.validate_archive`` has already rejected traversal,
symlinks, and oversize members; it still double-checks each target path
before writing and counts the bytes it actually writes, as a second line of
defense: the validators only ever saw the sizes the headers declared.
``swap_into_place`` moves a staged project over an existing one without ever
leaving neither on disk.
"""
from __future__ import annotations

import zipfile
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink

from ._project_import_archived import normalize_archived_runs
from ._project_import_validation import bad_request


_COPY_CHUNK = 64 * 1024


def safe_extract(
    zf: zipfile.ZipFile, members: dict[str, zipfile.ZipInfo], dest: Path,
    *, max_total_bytes: int | None = None,
) -> None:
    """Extract validated members into *dest*, double-checking each target path.

    Bytes are counted as they are written, not as the headers declare them: a
    member stops at its declared ``file_size`` and the archive as a whole at
    *max_total_bytes* (the budget ``validate_archive`` checked the headers
    against), so a header that lies cannot inflate the extraction.
    """
    dest_resolved = dest.resolve()
    remaining = max_total_bytes
    for arcname, info in members.items():
        target = (dest / arcname).resolve()
        if target != dest_resolved and not target.is_relative_to(dest_resolved):
            raise bad_request(f"Archive member would escape target dir: {arcname!r}", "PATH_ESCAPE")
        target.parent.mkdir(parents=True, exist_ok=True)
        limit = info.file_size if remaining is None else min(info.file_size, remaining)
        with zf.open(info) as src, open(target, "wb") as dst:
            written = _copy_bounded(src, dst, limit, arcname)
        if remaining is not None:
            remaining -= written
    for top in dest.iterdir():
        if top.is_dir() and not top.is_symlink():
            normalize_archived_runs(top)


def _copy_bounded(src, dst, limit: int, arcname: str) -> int:
    """Copy *src* to *dst* and return the bytes written; the first byte past
    *limit* rejects the archive before it reaches disk."""
    written = 0
    while chunk := src.read(_COPY_CHUNK):
        written += len(chunk)
        if written > limit:
            raise bad_request(f"Archive member extracts past its validated size: {arcname!r}", "TOO_LARGE")
        dst.write(chunk)
    return written


_REPLACED_BACKUP = ".replaced"


class StrandedBackupError(OSError):
    """The old project could not be moved back and now lives only in the
    staging dir's backup, so the caller must not delete that dir."""


def swap_into_place(staged: Path, final: Path, staging: Path, *, log: LogSink = NULL_LOG) -> None:
    """Move *final* aside into *staging*, then *staged* into its place.

    The old project is restored if the second move fails, so a failed
    replace never loses it. The backup is dropped with *staging*.
    """
    backup = staging / _REPLACED_BACKUP
    final.rename(backup)
    try:
        staged.rename(final)
    except OSError:
        try:
            backup.rename(final)
        except OSError as restore_exc:
            log.error(f"import: could not restore {final} ({restore_exc}); the old project is kept at {backup}")
            raise StrandedBackupError("old project kept in the staging backup") from restore_exc
        raise
