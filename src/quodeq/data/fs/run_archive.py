"""Pack a finished run's event log and evidence into one file, restore it on demand.

An archived run keeps its reports, ``status.json``, ``dimensions.json`` and
``evidence/manifest.json`` in place. ``events.jsonl``, the
``evidence/*_evidence.jsonl`` files and ``evaluation.db`` (WAL folded in
first) move into ``archive.tar.gz`` inside the run folder; the ``-wal`` and
``-shm`` sidecars are dropped. Keeping the database spares a restore the
multi-second rebuild measured on the biggest real runs.

Safety rules: originals are deleted only after the archive is written,
fsynced, verified and renamed into place; a restore extracts into a temporary
folder and renames each file into place before the archive goes. Leftover
temporary files from an interrupted attempt are removed at the start of the
next one. Both operations hold a per-run lock file.
"""
from __future__ import annotations

import fnmatch
import hashlib
import logging
import os
import posixpath
import shutil
import tarfile
import zlib
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from quodeq.core.utils.file_lock import lock_file, unlock_file
from quodeq.data.fs.run_archive_wal import DB_NAME, WAL_NAME, WalNotFoldedError, fold_wal

_logger = logging.getLogger(__name__)

ARCHIVE_FILENAME = "archive.tar.gz"
TIDY_PATTERNS = ("*_queue.json", "*_dispatch_keys.json", "*_replayed_unconsolidated_keys.json")

_EVENTS = "events.jsonl"
_EVIDENCE_DIR = "evidence"
_EVIDENCE_PATTERN = "*_evidence.jsonl"
_DB_SIDECARS = (WAL_NAME, "evaluation.db-shm")
_TMP_ARCHIVE = ARCHIVE_FILENAME + ".tmp"
_RESTORE_DIR = ".restore.tmp"
_LOCK_NAME = ".archive.lock"
_CHUNK = 1 << 20
_READ_ERRORS = (tarfile.TarError, OSError, EOFError, zlib.error)


class RunArchiveError(ValueError):
    """The run cannot be archived, or its archive is unsafe or unreadable."""


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
    return (run_dir / _EVENTS).is_file() or is_archived(run_dir)


@contextmanager
def _run_lock(run_dir: Path) -> Iterator[None]:
    """Hold the run's exclusive archive lock for the block.

    The lock file is never deleted: removing it would let a waiter lock an
    unlinked file while a newcomer locks a fresh one.
    """
    fd = os.open(run_dir / _LOCK_NAME, os.O_RDWR | os.O_CREAT, 0o644)
    try:
        lock_file(fd)
        try:
            yield
        finally:
            unlock_file(fd)
    finally:
        os.close(fd)


def _clean_leftovers(run_dir: Path) -> None:
    """Remove a temporary archive or restore folder left by an interrupted attempt."""
    (run_dir / _TMP_ARCHIVE).unlink(missing_ok=True)
    staging = run_dir / _RESTORE_DIR
    if staging.is_dir() and not staging.is_symlink():
        shutil.rmtree(staging)
    else:
        staging.unlink(missing_ok=True)


def _is_plain_file(path: Path) -> bool:
    return path.is_file() and not path.is_symlink()


def _archive_sources(run_dir: Path) -> list[tuple[str, Path]]:
    """(member name, source path) for every file that moves into the archive."""
    sources = [(_EVENTS, run_dir / _EVENTS)]
    if _is_plain_file(run_dir / DB_NAME):
        sources.append((DB_NAME, run_dir / DB_NAME))
    evidence = run_dir / _EVIDENCE_DIR
    if evidence.is_dir():
        for path in sorted(evidence.glob(_EVIDENCE_PATTERN)):
            if _is_plain_file(path):
                sources.append((f"{_EVIDENCE_DIR}/{path.name}", path))
    return sources


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
    with _run_lock(run_dir):
        _clean_leftovers(run_dir)
        if is_archived(run_dir):
            raise RunArchiveError(f"run is already archived: {run_dir}")
        if not _is_plain_file(run_dir / _EVENTS):
            raise RunArchiveError(f"run has no event log: {run_dir}")
        try:
            fold_wal(run_dir)
        except WalNotFoldedError as exc:
            raise RunArchiveError(str(exc)) from exc
        sources = _archive_sources(run_dir)
        dropped = [run_dir / name for name in _DB_SIDECARS if (run_dir / name).is_file()]
        bytes_before = sum(p.stat().st_size for p in [*(p for _, p in sources), *dropped])
        tmp, final = run_dir / _TMP_ARCHIVE, run_dir / ARCHIVE_FILENAME
        try:
            _write_archive(tmp, sources)
            _verify_archive(tmp, sources)
            os.replace(tmp, final)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
        for path in [*(p for _, p in sources), *dropped]:
            path.unlink(missing_ok=True)
        return ArchiveResult(bytes_before=bytes_before, bytes_after=final.stat().st_size)


def _allowed_name(name: str) -> bool:
    """True for ``events.jsonl``, ``evaluation.db`` and ``evidence/<x>_evidence.jsonl`` only."""
    if name in (_EVENTS, DB_NAME):
        return True
    folder, _, base = name.partition("/")
    return folder == _EVIDENCE_DIR and "/" not in base and fnmatch.fnmatchcase(base, _EVIDENCE_PATTERN)


def _check_members(members: list[tarfile.TarInfo], staging: Path) -> list[str]:
    """Member names when every member is a safe regular file, else raise ``RunArchiveError``."""
    root = staging.resolve()
    names: list[str] = []
    for member in members:
        name = member.name
        if not member.isreg():
            raise RunArchiveError(f"archive member {name!r} is not a regular file")
        if "\\" in name or posixpath.isabs(name) or posixpath.normpath(name) != name:
            raise RunArchiveError(f"archive member {name!r} has an unsafe path")
        if not (root / name).resolve().is_relative_to(root) or not _allowed_name(name):
            raise RunArchiveError(f"archive member {name!r} is not an archived run file")
        if name in names:
            raise RunArchiveError(f"archive member {name!r} appears twice")
        names.append(name)
    return names


def _extract(archive: Path, staging: Path) -> list[str]:
    """Validate and extract *archive* into *staging*; the member names on success."""
    try:
        with tarfile.open(archive, "r:gz") as tar:
            members = tar.getmembers()
            names = _check_members(members, staging)
            staging.mkdir()
            tar.extractall(staging, members=members, filter="data")
    except RunArchiveError:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    except _READ_ERRORS as exc:
        shutil.rmtree(staging, ignore_errors=True)
        raise RunArchiveError(f"cannot read run archive {archive}: {exc}") from exc
    return names


def ensure_restored(run_dir: Path) -> bool:
    """Restore an archived run in place. True when it restored, False when nothing was archived.

    Concurrent callers serialise on the run lock: one restores, the others
    wait and then find nothing left to do. Raises ``RunArchiveError`` (and
    leaves the archive in place) on an unsafe or unreadable archive.
    """
    if not is_archived(run_dir):
        return False
    with _run_lock(run_dir):
        if not is_archived(run_dir):
            return False
        _clean_leftovers(run_dir)
        archive, staging = run_dir / ARCHIVE_FILENAME, run_dir / _RESTORE_DIR
        try:
            names = _extract(archive, staging)
        except RunArchiveError as exc:
            _logger.warning("Refusing to restore run archive: %s", exc)
            raise
        for name in names:
            dest = run_dir / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            os.replace(staging / name, dest)
        archive.unlink()
        shutil.rmtree(staging, ignore_errors=True)
        return True


def restore_or_warn(run_dir: Path) -> bool:
    """``ensure_restored`` for readers: False, with a warning, when the archive stays.

    A refused archive, a timed-out lock wait or a failed move reads as a run
    without an event log, never as an error. ``ensure_restored`` already logs
    its refusals, so only OS errors are logged here.
    """
    try:
        ensure_restored(run_dir)
    except RunArchiveError:
        return False
    except OSError as exc:
        _logger.warning("Could not restore run archive in %s: %s", run_dir, exc)
        return False
    return True


def tidy_run(run_dir: Path) -> int:
    """Remove scratch sidecars from ``evidence/`` and fold the WAL; the bytes freed."""
    freed = 0
    with _run_lock(run_dir):
        evidence = run_dir / _EVIDENCE_DIR
        if evidence.is_dir():
            for pattern in TIDY_PATTERNS:
                for path in evidence.glob(pattern):
                    if _is_plain_file(path):
                        freed += path.stat().st_size
                        path.unlink()
        try:
            freed += fold_wal(run_dir)
        except WalNotFoldedError as exc:
            _logger.warning("Could not checkpoint: %s", exc)
    return freed
