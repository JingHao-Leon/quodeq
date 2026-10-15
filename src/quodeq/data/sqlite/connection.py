"""Connection context manager for evaluation.db.

Sets WAL mode, foreign keys, and a busy-timeout that tolerates concurrent
sibling MCP server processes (mirrors the behavior of the existing JSONL
write path which relies on POSIX flock). A process that may only read the
run directory (the assistant's MCP server inside the Codex OS sandbox, a
read-only mount) gets a read-only connection to an existing database, and
the boundary's unreadable-store error when there is none, so readers fall
back to the JSON reports instead of crashing.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from quodeq.data.sqlite._db_stamp_memo import db_stamp
from quodeq.data.sqlite._migrations import SchemaVersionError, apply_evaluation_schema
from quodeq.data.sqlite._schema import SCHEMA_VERSION
from quodeq.data.sqlite.constants import SQLITE_BUSY_TIMEOUT_MS
from quodeq.data.sqlite.errors import SqliteStoreUnreadableError, as_store_error
from quodeq.data.sqlite.read_only import connect_read_only, unwritable
from quodeq.shared import request_metrics

EVALUATION_DB_FILENAME = "evaluation.db"


def evaluation_db_stamp(run_dir: Path) -> tuple | None:
    """Identity of the run database's contents on disk (main file and WAL),
    or None when the run has none. For memos that hold while it is unchanged."""
    return db_stamp(run_dir / EVALUATION_DB_FILENAME)


def _configure(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS}")


def _connect_read_only(path: Path) -> sqlite3.Connection:
    """The read-only fallback for an existing database, checked against the
    schema this binary knows; the boundary error when there is no database."""
    try:
        conn = connect_read_only(path)
    except FileNotFoundError:
        raise SqliteStoreUnreadableError(
            f"no evaluation database at {path} and its directory is not writable") from None
    try:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version > SCHEMA_VERSION:
            raise SchemaVersionError(
                f"evaluation.db has schema version {version}, this binary supports {SCHEMA_VERSION}")
    except (sqlite3.DatabaseError, SchemaVersionError):
        conn.close()
        raise
    return conn


def _connect(path: Path) -> sqlite3.Connection:
    """The regular read-write connection, or the read-only fallback when
    this process cannot write where the database lives. A connection that
    fails its setup is closed before the error leaves."""
    try:
        conn = sqlite3.connect(path)
    except sqlite3.OperationalError as exc:
        if not unwritable(exc):
            raise
        return _connect_read_only(path)
    try:
        _configure(conn)
        apply_evaluation_schema(conn)
        conn.commit()
    except sqlite3.OperationalError as exc:
        conn.close()
        if not unwritable(exc):
            raise
        return _connect_read_only(path)
    except Exception:
        conn.close()
        raise
    return conn


@contextmanager
def open_evaluation_db(run_dir: Path) -> Iterator[sqlite3.Connection]:
    """Open (creating if needed) the run's evaluation.db with the schema applied.

    Creates *run_dir* and closes the connection on the way out. Connect and IO
    failures surface as ``RuntimeError`` naming the path; schema-version
    mismatches and corruption surface as ``StoreUnreadableError`` (still a
    ``sqlite3.DatabaseError``) so readers can fall back to the filesystem.
    """
    try:
        run_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        if not run_dir.is_dir():
            raise
    path = run_dir / EVALUATION_DB_FILENAME
    conn: sqlite3.Connection | None = None
    try:
        try:
            request_metrics.count("db_opens")
            conn = _connect(path)
        except sqlite3.OperationalError as exc:
            # Connect/IO-level failures (locked or missing file, disk I/O error):
            # give callers a clear, run-scoped message instead of a bare sqlite3
            # error with no path context.
            raise RuntimeError(f"Could not open evaluation database at {path}: {exc}") from exc
        except SqliteStoreUnreadableError:
            # A schema-version mismatch already is the boundary error.
            raise
        except sqlite3.DatabaseError as exc:
            # Generic corruption ("file is not a database") becomes the
            # boundary's unreadable-store error, which is still a
            # sqlite3.DatabaseError: readers (dashboard/scores/findings
            # queries) catch either type to degrade gracefully to
            # filesystem-based data. Wrapping in RuntimeError would break
            # that fallback.
            raise as_store_error(exc) from exc
        except sqlite3.Error as exc:
            raise RuntimeError(f"Could not open evaluation database at {path}: {exc}") from exc
        try:
            yield conn
        except SqliteStoreUnreadableError:
            raise
        except sqlite3.DatabaseError as exc:
            # A malformed image can surface on the first query rather than
            # at connect time; it gets the same boundary error.
            raise as_store_error(exc) from exc
    finally:
        # Guards both setup failures (conn may or may not have been created)
        # and the normal yield path -- conn is only ever left open here if
        # sqlite3.connect() itself never returned one.
        if conn is not None:
            conn.close()
