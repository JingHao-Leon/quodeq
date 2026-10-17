"""The random token that ties a shared clone run's database to its ``local_db`` record.

Device and inode alone do not prove quodeq created the file: a file system
can hand a freed inode straight back to the file a checkout writes. A
database quodeq creates in a clone therefore carries a random token in the
``quodeq_local`` table, and the ``local_db`` record holds the same token. A
repository cannot know it, so a database it carries never matches.

The token is read through a separate, immutable, read-only connection with
``trusted_schema`` off, so reading it runs nothing the file defines and
never touches a write-ahead log beside it; the write checkpoints the log so
that read sees the token. Any failure reads as no token.
"""
from __future__ import annotations

import secrets
import sqlite3
from pathlib import Path

TOKEN_TABLE = "quodeq_local"
_TOKEN_BYTES = 16  # 128 bits


def new_token() -> str:
    """A fresh 128-bit token, as hex."""
    return secrets.token_hex(_TOKEN_BYTES)


def read_db_token(path: Path) -> str | None:
    """The token stored in the database at *path*, or None when there is none or it cannot be read."""
    if not path.is_file():
        return None
    uri = f"{path.resolve().as_uri()}?mode=ro&immutable=1"
    try:
        conn = sqlite3.connect(uri, uri=True)
    except sqlite3.Error:
        return None
    try:
        conn.execute("PRAGMA trusted_schema = OFF")
        row = conn.execute(f"SELECT token FROM {TOKEN_TABLE} LIMIT 1").fetchone()
    except sqlite3.Error:
        return None
    finally:
        conn.close()
    return row[0] if row and isinstance(row[0], str) else None


def write_db_token(conn: sqlite3.Connection, token: str) -> None:
    """Store *token* as the database's only token and checkpoint it into the main file."""
    conn.execute(f"CREATE TABLE IF NOT EXISTS {TOKEN_TABLE} (token TEXT)")
    conn.execute(f"DELETE FROM {TOKEN_TABLE}")
    conn.execute(f"INSERT INTO {TOKEN_TABLE} (token) VALUES (?)", (token,))
    conn.commit()
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
