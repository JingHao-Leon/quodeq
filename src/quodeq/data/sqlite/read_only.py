"""Read-only access to a SQLite file this process may not write to.

The assistant's MCP server runs inside the Codex OS sandbox, which allows
writes only to a few paths; a read-only mount is the same situation. The
regular openers try their read-write connection first and, when sqlite
answers that the file or its directory cannot be opened for writing, fall
back to these helpers. ``immutable=1`` needs no -wal/-shm siblings, so a WAL
database opens without creating anything and reads its last checkpointed
state; ``query_only`` marks the connection so writers skip their work.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

# sqlite's wording when the file, its -wal/-shm siblings or the directory
# cannot be opened for writing by this process.
_UNWRITABLE_MARKERS = ("unable to open database file", "readonly database")


def unwritable(exc: sqlite3.OperationalError) -> bool:
    """Whether *exc* says this process may not write where the database lives."""
    message = str(exc).lower()
    return any(marker in message for marker in _UNWRITABLE_MARKERS)


def is_read_only(conn: sqlite3.Connection) -> bool:
    """Whether *conn* came from ``connect_read_only``: writers skip their work on it.

    Anything that cannot answer the pragma (a broken connection, a test
    double) counts as writable; the write's own guard still sees its failure.
    """
    try:
        return bool(conn.execute("PRAGMA query_only").fetchone()[0])
    except (AttributeError, sqlite3.Error):
        return False


def connect_read_only(path: Path) -> sqlite3.Connection:
    """A read-only connection to the existing database at *path*.

    Raises ``FileNotFoundError`` when there is no file: there is nothing to
    read and nothing may be created.
    """
    if not path.is_file():
        raise FileNotFoundError(path)
    conn = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True)
    try:
        conn.execute("PRAGMA query_only = ON")
    except sqlite3.DatabaseError:
        conn.close()
        raise
    return conn
