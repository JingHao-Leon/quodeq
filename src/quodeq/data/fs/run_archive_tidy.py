"""Tidy a finished run in place: scratch sidecars out of ``evidence/``, the WAL folded, the database compacted."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from quodeq.data.fs.run_archive_files import ARCHIVE_FILENAME, EVIDENCE_DIR, is_plain_file
from quodeq.data.fs.run_archive_guard import run_lock
from quodeq.data.fs.run_archive_wal import WalNotFoldedError, fold_wal, needs_db_tidy, vacuum_db

_logger = logging.getLogger(__name__)

# The dispatch queues (``*_queue.json``) stay: files analysed and partly scanned dimensions read them.
TIDY_PATTERNS = ("*_dispatch_keys.json", "*_replayed_unconsolidated_keys.json")


def _is_archived(run_dir: Path) -> bool:
    return (run_dir / ARCHIVE_FILENAME).is_file()


def tidy_run(run_dir: Path) -> int:
    """Remove scratch sidecars from ``evidence/``, fold the WAL and VACUUM the database; the bytes freed.

    The scratch files are never packed nor restored, so they go without the
    run lock. The database work takes it, and only when there is some: a run
    without a lock file keeps it that way, and its readers the lock-free open.
    A failed checkpoint or VACUUM is logged and tidy carries on.
    """
    freed = 0
    evidence = run_dir / EVIDENCE_DIR
    if evidence.is_dir():
        for path in (p for pattern in TIDY_PATTERNS for p in evidence.glob(pattern)):
            if is_plain_file(path):
                freed += path.stat().st_size
                path.unlink(missing_ok=True)
    if _is_archived(run_dir) or not needs_db_tidy(run_dir):
        return freed
    with run_lock(run_dir):
        try:
            freed += fold_wal(run_dir)
        except WalNotFoldedError as exc:
            _logger.warning("Could not checkpoint: %s", exc)
        if not _is_archived(run_dir):
            try:
                freed += vacuum_db(run_dir)
            except sqlite3.Error as exc:
                _logger.warning("Could not vacuum the database of %s: %s", run_dir, exc)
    return freed
