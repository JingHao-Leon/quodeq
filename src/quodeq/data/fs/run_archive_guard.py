"""Guards around a run archive: the run lock, the restore stamp, the source snapshot, the once-per-run warning.

A restore leaves ``.restored_at`` (the UTC time, ISO format) in the run
folder, so storage cleanup keeps a restored run warm for the full window
instead of archiving it again on the next pass. The snapshot lets
``archive_run`` notice a file that changed, or a database that was opened,
while it was packing, and keep the originals. A run whose archive cannot be
restored is warned about once per process, not on every read.
"""
from __future__ import annotations

import errno
import logging
import os
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from quodeq.core.utils.file_lock import lock_file, unlock_file
from quodeq.data.fs.run_archive_files import DB_SIDECARS
from quodeq.data.fs.run_archive_wal import DB_NAME

_logger = logging.getLogger(__name__)

RESTORED_STAMP = ".restored_at"
LOCK_NAME = ".archive.lock"
_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)  # a lock file planted as a link never creates its target

_StatKey = tuple[int, int, int] | None

_warned: set[Path] = set()
_warned_lock = threading.Lock()


def warn_once(run_dir: Path, message: str, *args: object) -> None:
    """Log *message* as a warning the first time it concerns *run_dir* in this process."""
    with _warned_lock:
        if run_dir in _warned:
            return
        _warned.add(run_dir)
    _logger.warning(message, *args)


def write_restored_stamp(run_dir: Path) -> None:
    """Record that *run_dir* was restored now; a failed write is logged, never raised."""
    try:
        (run_dir / RESTORED_STAMP).write_text(datetime.now(timezone.utc).isoformat(), encoding="utf-8")
    except OSError as exc:
        _logger.warning("Could not stamp the restore of %s: %s", run_dir, exc)


def restored_at(run_dir: Path) -> datetime | None:
    """When *run_dir* was last restored, None when it never was.

    An unreadable stamp falls back to the stamp file's modification time.
    """
    stamp = run_dir / RESTORED_STAMP
    try:
        text = stamp.read_text(encoding="utf-8").strip()
        mtime = stamp.stat().st_mtime
    except OSError:
        return None
    try:
        when = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return datetime.fromtimestamp(mtime, timezone.utc)
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def _stat_key(path: Path) -> _StatKey:
    try:
        st = path.stat()
    except FileNotFoundError:
        return None
    return st.st_size, st.st_mtime_ns, st.st_ino


def snapshot(paths: list[Path]) -> dict[Path, _StatKey]:
    """Size, modification time and inode of each path; None for a path that does not exist."""
    return {path: _stat_key(path) for path in paths}


def unchanged(taken: dict[Path, _StatKey]) -> bool:
    """True when every path still matches *taken*: none changed, appeared or went."""
    return all(_stat_key(path) == key for path, key in taken.items())


@contextmanager
def run_lock(run_dir: Path) -> Iterator[None]:
    """Hold the run's exclusive archive lock for the block.

    The lock file is never deleted: removing it would let a waiter lock an
    unlinked file while a newcomer locks a fresh one.
    """
    with _locked(os.open(run_dir / LOCK_NAME, os.O_RDWR | os.O_CREAT | _NOFOLLOW, 0o644)):
        yield


@contextmanager
def run_lock_if_writable(run_dir: Path) -> Iterator[bool]:
    """``run_lock``, or no lock (False) where this process cannot write the run folder.

    A read-only process (the assistant inside a sandbox, a read-only mount)
    can neither create the lock file nor archive or restore the run.
    """
    try:
        fd = os.open(run_dir / LOCK_NAME, os.O_RDWR | os.O_CREAT | _NOFOLLOW, 0o644)
    except OSError as exc:
        if exc.errno not in (errno.EACCES, errno.EPERM, errno.EROFS):
            raise
        fd = None
    if fd is None:
        yield False
        return
    with _locked(fd):
        yield True


@contextmanager
def _locked(fd: int) -> Iterator[None]:
    try:
        lock_file(fd)
        try:
            yield
        finally:
            unlock_file(fd)
    finally:
        os.close(fd)


def drop_stray_db_locked(run_dir: Path) -> None:
    """Delete ``evaluation.db`` and its sidecars from an archived run; the caller holds the run lock.

    Archive, abort and restore all finish before releasing that lock, so a
    database beside the archive there is always a stray from a raced connect.
    """
    for name in (DB_NAME, *DB_SIDECARS):
        (run_dir / name).unlink(missing_ok=True)
