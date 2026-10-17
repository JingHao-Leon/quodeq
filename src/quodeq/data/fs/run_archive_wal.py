"""Fold a run database's write-ahead log before the file is archived, and VACUUM it on tidy."""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB_NAME = "evaluation.db"
WAL_NAME = "evaluation.db-wal"
_BUSY_TIMEOUT_S = 5.0


class WalNotFoldedError(RuntimeError):
    """The log could not be folded completely; dropping it would lose rows."""


def fold_wal(run_dir: Path) -> int:
    """Fold ``evaluation.db-wal`` into the database; the WAL bytes freed.

    Raises ``WalNotFoldedError`` when a reader holds the log or the database is unreadable.
    """
    db, wal = run_dir / DB_NAME, run_dir / WAL_NAME
    if not db.is_file() or not wal.is_file():
        return 0
    before = wal.stat().st_size
    try:
        conn = sqlite3.connect(db, timeout=_BUSY_TIMEOUT_S)
        try:
            busy = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0]
        finally:
            conn.close()
    except sqlite3.Error as exc:
        raise WalNotFoldedError(f"cannot fold the database log of {run_dir}: {exc}") from exc
    if busy or (wal.exists() and wal.stat().st_size):
        raise WalNotFoldedError(f"database log of {run_dir} is still in use")
    return before


def _size(path: Path) -> int:
    try:
        return path.stat().st_size
    except FileNotFoundError:
        return 0


def vacuum_db(run_dir: Path) -> int:
    """Rebuild ``evaluation.db`` without its free pages; the bytes freed (0 when none were free).

    Raises ``sqlite3.Error`` when the database is busy or unreadable.
    """
    db, wal = run_dir / DB_NAME, run_dir / WAL_NAME
    if not db.is_file():
        return 0
    before = _size(db) + _size(wal)
    conn = sqlite3.connect(db, timeout=_BUSY_TIMEOUT_S)
    try:
        if not conn.execute("PRAGMA freelist_count").fetchone()[0]:
            return 0
        conn.execute("VACUUM")
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        conn.close()
    return max(0, before - _size(db) - _size(wal))
