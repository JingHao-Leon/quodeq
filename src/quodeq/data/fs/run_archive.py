"""Pack a finished run's event log and evidence into one file, restore it on demand.

An archived run keeps its reports, ``status.json``, ``dimensions.json`` and
``evidence/manifest.json`` in place. ``events.jsonl`` and the
``evidence/*_evidence.jsonl`` files move into ``archive.tar.gz`` inside the
run folder; ``evaluation.db`` (WAL folded in first) and its ``-wal`` and
``-shm`` sidecars are deleted, and the run's dismissals are kept beside the
archive in ``precedents.json`` (see ``run_precedents``), its grades and counts in
``scalars.json`` (see ``run_scalars``). A restore rebuilds the database from
the event log (about two seconds on the biggest real run); an archive written
before 1.15 still carries one and restores it as it is.

Safety rules: originals are deleted only after the archive is written,
fsynced, verified and renamed into place, and only when no packed file
changed, none was added and no database sidecar appeared meanwhile (one that cannot be deleted
undoes the archive); a run a restore would refuse as too big is never packed. A restore extracts into a temporary
folder and renames each file into place before the archive goes. Leftover
temporary files from an interrupted attempt are removed at the start of the
next one. Both operations hold a per-run lock file.
"""
from __future__ import annotations

import hashlib
import logging
import os
import shutil
import tarfile
import zlib
from dataclasses import dataclass
from functools import partial
from pathlib import Path

from quodeq.data.fs.run_archive_guard import (  # noqa: F401 -- run_lock re-exported
    RESTORED_STAMP, run_lock, snapshot, unchanged, warn_once, write_restored_stamp,
)
from quodeq.data.fs.run_archive_files import (  # noqa: F401 -- ARCHIVE_FILENAME re-exported
    ARCHIVE_FILENAME, DROPPED_FILES, EVENTS_NAME, EVIDENCE_DIR, EVIDENCE_PATTERN, archive_sources,
    dropped_sidecars, is_plain_file,
)
from quodeq.data.fs.run_archive_limits import RunArchiveError, check_members, check_packable, check_restore_dirs, read_members  # noqa: F401
from quodeq.data.fs.run_archive_tidy import TIDY_PATTERNS, tidy_run  # noqa: F401 -- re-exported for the archive's callers
from quodeq.data.fs.run_precedents import PRECEDENTS_NAME, write_precedents
from quodeq.data.fs.run_scalars import SCALARS_NAME, write_scalars
from quodeq.data.fs.shared_clone_runs import is_shared_clone_run, restore_clone_locked
from quodeq.data.fs.run_archive_wal import DB_NAME, WalNotFoldedError, fold_wal
from quodeq.shared.fault_isolation import run_isolated

_logger = logging.getLogger(__name__)

_TMP_ARCHIVE = ARCHIVE_FILENAME + ".tmp"
_RESTORE_DIR = ".restore.tmp"
_CHUNK = 1 << 20
READ_ERRORS = (tarfile.TarError, OSError, EOFError, zlib.error)


@dataclass(frozen=True)
class ArchiveResult:
    """Bytes the archived and dropped files took before, and the archive's size after."""

    bytes_before: int
    bytes_after: int


def is_archived(run_dir: Path) -> bool:
    """True when the run's event log and evidence live in ``archive.tar.gz``."""
    return (run_dir / ARCHIVE_FILENAME).is_file()


def has_event_log(run_dir: Path) -> bool:
    """True when ``events.jsonl`` is a file, or the run is archived."""
    return (run_dir / EVENTS_NAME).is_file() or is_archived(run_dir)


def _clean_leftovers(run_dir: Path) -> None:
    """Remove a temporary archive or restore folder left by an interrupted attempt."""
    (run_dir / _TMP_ARCHIVE).unlink(missing_ok=True)
    staging = run_dir / _RESTORE_DIR
    if staging.is_dir() and not staging.is_symlink():
        shutil.rmtree(staging)
    else:
        staging.unlink(missing_ok=True)


def _write_archive(tmp: Path, sources: list[tuple[str, Path]]) -> None:
    """Write *sources* into *tmp* as a gzip tar and fsync it to disk."""
    with open(tmp, "wb") as raw:
        with tarfile.open(fileobj=raw, mode="w:gz") as tar:
            for name, path in sources:
                tar.add(path, arcname=name, recursive=False)
        raw.flush()
        os.fsync(raw.fileno())


def _digest(stream) -> str:
    sha = hashlib.sha256()
    for chunk in iter(lambda: stream.read(_CHUNK), b""):
        sha.update(chunk)
    return sha.hexdigest()


def _verify_archive(tmp: Path, sources: list[tuple[str, Path]]) -> None:
    """Reopen *tmp* and check it holds exactly *sources*, byte for byte."""
    expected = {}
    for name, path in sources:
        with open(path, "rb") as fh:
            expected[name] = (path.stat().st_size, _digest(fh))
    found = {}
    with tarfile.open(tmp, "r:gz") as tar:
        for member in tar:
            stream = tar.extractfile(member) if member.isreg() else None
            if stream is None:
                raise RunArchiveError(f"archive member {member.name!r} is not a regular file")
            found[member.name] = (member.size, _digest(stream))
    if found != expected:
        raise RunArchiveError("archive contents do not match the run's files")


def archive_run(run_dir: Path) -> ArchiveResult:
    """Pack *run_dir*'s event log and evidence into ``archive.tar.gz``.

    Raises ``RunArchiveError`` when the run has no ``events.jsonl`` or is
    already archived. Any failure before the archive is renamed into place
    leaves every original untouched and removes the temporary file.
    """
    with run_lock(run_dir):
        _clean_leftovers(run_dir)
        if is_archived(run_dir):
            raise RunArchiveError(f"run is already archived: {run_dir}")
        if not is_plain_file(run_dir / EVENTS_NAME):
            raise RunArchiveError(f"run has no event log: {run_dir}")
        try:
            fold_wal(run_dir)
        except WalNotFoldedError as exc:
            raise RunArchiveError(str(exc)) from exc
        sources = archive_sources(run_dir)
        check_packable([p.stat().st_size for _, p in sources])
        dropped = dropped_sidecars(run_dir)
        bytes_before = sum(p.stat().st_size for p in [*(p for _, p in sources), *dropped])
        tmp, final = run_dir / _TMP_ARCHIVE, run_dir / ARCHIVE_FILENAME
        packed = snapshot([*(p for _, p in sources), *(run_dir / name for name in DROPPED_FILES)])
        try:
            write_precedents(run_dir)  # precedent matching reads these without a restore
            write_scalars(run_dir)  # and the run list, trend and warm-up read these
            _write_archive(tmp, sources)
            _verify_archive(tmp, sources)
            os.replace(tmp, final)
            # A reader or writer touched the run while it was packed, or added a file the archive would hold.
            if not unchanged(packed) or archive_sources(run_dir) != sources:
                final.unlink(missing_ok=True)
                raise RunArchiveError(f"run changed while it was archived: {run_dir}")
        except BaseException:
            tmp.unlink(missing_ok=True)
            for sidecar in (PRECEDENTS_NAME, SCALARS_NAME):
                (run_dir / sidecar).unlink(missing_ok=True)
            raise
        # The database goes like a packed original: one left beside an archive would be opened as current.
        _drop_originals(run_dir, [*sources, *((DB_NAME, p) for p in dropped if p.name == DB_NAME)])
        for path in [*(p for p in dropped if p.name != DB_NAME), run_dir / RESTORED_STAMP]:
            try:  # a restore drops stray sidecars and rewrites the stamp, so one left behind is harmless
                path.unlink(missing_ok=True)
            except OSError as exc:
                _logger.debug("Could not remove %s after archiving: %s", path, exc)
        return ArchiveResult(bytes_before=bytes_before, bytes_after=final.stat().st_size)


def _drop_originals(run_dir: Path, sources: list[tuple[str, Path]]) -> None:
    """Delete the packed originals; when one cannot go (a file held open on Windows), undo the archive.

    The files already deleted come back from the verified archive and the
    archive goes, so the run is plainly unpacked and the next pass tries
    again, never left with an archive and originals side by side.
    """
    try:
        for _, path in sources:
            path.unlink(missing_ok=True)
    except OSError as exc:
        kept = tuple(name for name, path in sources if path.exists())
        staging = run_dir / _RESTORE_DIR
        for name in _extract(run_dir / ARCHIVE_FILENAME, staging, skip=kept):
            os.replace(staging / name, run_dir / name)
        shutil.rmtree(staging, ignore_errors=True)
        for name in (ARCHIVE_FILENAME, PRECEDENTS_NAME, SCALARS_NAME):
            (run_dir / name).unlink(missing_ok=True)
        raise RunArchiveError(f"could not remove the packed files of {run_dir}, left it unpacked: {exc}") from exc


def _extract(archive: Path, staging: Path, skip: tuple[str, ...] = (), *, ratio_capped: bool = False) -> list[str]:
    """Validate *archive* and extract it into *staging*, leaving out the members named in *skip*; their names.
    *ratio_capped* (an archive someone else wrote) also caps unpacked size at a multiple of packed size."""
    try:
        with tarfile.open(archive, "r:gz") as tar:
            members = read_members(tar, archive.stat().st_size if ratio_capped else None)
            names = [name for name in check_members(members, staging) if name not in skip]
            staging.mkdir()
            tar.extractall(staging, members=[m for m in members if m.name in names], filter="data")
    except RunArchiveError:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    except READ_ERRORS as exc:
        shutil.rmtree(staging, ignore_errors=True)
        raise RunArchiveError(f"cannot read run archive {archive}: {exc}") from exc
    return names


def ensure_restored(run_dir: Path, *, project: bool = True) -> bool:
    """Restore an archived run in place. True when it restored, False when nothing was archived.

    Concurrent callers serialise on the run lock: one restores, the others
    wait and then find nothing left to do. Raises ``RunArchiveError`` (and
    leaves the archive in place) on an unsafe or unreadable archive. With
    *project* (the default) a restore that brought no database rebuilds it
    from the event log; a caller that only reads the files, or that projects
    itself (and may hold the projector's lock), passes False.
    """
    if not is_archived(run_dir):
        return False
    with run_lock(run_dir):
        names = _restore_locked(run_dir)
    # An archive written before 1.15 brings its database back; a shared clone's is rebuilt when its database is opened.
    if project and names is not None and DB_NAME not in names and not is_shared_clone_run(run_dir):
        _project_after_restore(run_dir)  # outside the lock: opening the database takes it
    return names is not None


def restore_locked(run_dir: Path) -> bool:
    """``ensure_restored`` for a caller that already holds the run lock (a second lock would wait on itself).

    The database is not rebuilt here (the caller holds the lock a rebuild
    needs); a caller that opens the database next projects it itself.
    """
    return _restore_locked(run_dir) is not None


def _restore_locked(run_dir: Path) -> list[str] | None:
    """Restore under the caller's lock; the member names restored, None when nothing was archived."""
    if not is_archived(run_dir):
        return None
    _clean_leftovers(run_dir)
    archive, staging = run_dir / ARCHIVE_FILENAME, run_dir / _RESTORE_DIR
    if is_shared_clone_run(run_dir):  # the archive is tracked there: unpack beside it, never its database
        return [] if restore_clone_locked(run_dir, staging, partial(_extract, ratio_capped=True)) else None
    try:
        check_restore_dirs(run_dir)
        names = _extract(archive, staging)
    except RunArchiveError as exc:
        warn_once(run_dir, "Refusing to restore run archive: %s", exc)
        raise
    # A database or sidecar beside an archive is a stray (an archive step that could not delete it);
    # left there, SQLite would replay a stale WAL into the restored or rebuilt database.
    for stray in DROPPED_FILES:
        (run_dir / stray).unlink(missing_ok=True)
    for name in names:
        dest = run_dir / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        os.replace(staging / name, dest)
    archive.unlink()
    shutil.rmtree(staging, ignore_errors=True)
    write_restored_stamp(run_dir)
    return names


def _ensure_projected(run_dir: Path) -> None:
    from quodeq.data.sqlite.findings_repository import SqliteFindingsRepository  # noqa: PLC0415  -- import cycle

    SqliteFindingsRepository(run_dir).ensure_projected()


def _project_after_restore(run_dir: Path) -> None:
    """Rebuild the database of a run whose archive held none, so the next reader finds its grades.

    A failed rebuild is logged; the readers that project rebuild it on
    their first read.
    """
    run_isolated(lambda: _ensure_projected(run_dir), label=f"rebuild the database of restored run {run_dir}", log=_logger)


def restore_or_warn(run_dir: Path, *, project: bool = True) -> bool:
    """``ensure_restored`` for readers: False, with a warning, when the archive stays.

    A refused archive, a timed-out lock wait or a failed move reads as a run
    without an event log, never as an error. ``ensure_restored`` already logs
    its refusals, so only OS errors are logged here; each run is warned about
    once per process. *project* as in ``ensure_restored``.
    """
    try:
        ensure_restored(run_dir, project=project)
    except RunArchiveError:
        return False
    except OSError as exc:
        warn_once(run_dir, "Could not restore run archive in %s: %s", run_dir, exc)
        return False
    return True


def restore_for_read(run_dir: Path, path: Path, *, project: bool = True) -> bool:
    """``restore_or_warn``, checked again under the run lock when the run was archived before *path* was read."""
    if not restore_or_warn(run_dir, project=project):
        return False
    if path.exists() or not is_archived(run_dir):
        return True
    return restore_or_warn(run_dir, project=project)
