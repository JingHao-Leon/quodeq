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

from quodeq.data.fs.run_archive import RunArchiveError, is_archived, restore_locked
from quodeq.data.fs.run_archive_guard import LOCK_NAME, drop_stray_db_locked, run_lock_if_writable, warn_once
from quodeq.data.fs.shared_clone_runs import (
    is_shared_clone_run, mark_local_db, trust_local_db_locked, unpacked_current,
)
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


def _open_mapped(path: Path) -> sqlite3.Connection:
    """``_connect`` with its failures mapped to the errors ``open_evaluation_db`` documents."""
    try:
        request_metrics.count("db_opens")
        return _connect(path)
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


def _open_unarchived(run_dir: Path, path: Path) -> sqlite3.Connection:
    """Connect to the run's real database, never to one beside an archive.

    A run that was never archived or restored has no lock file: it connects
    unlocked, so reads leave no file behind. An archive or restore creates
    the lock file before it touches anything, so one found afterwards means
    it may have raced the connect: that connection is dropped and the run
    opened again under the lock. A shared clone's run always opens under the
    lock, which checks its database is one quodeq created there.
    """
    lock = run_dir / LOCK_NAME
    if not lock.exists() and not is_archived(run_dir) and not is_shared_clone_run(run_dir):
        conn = _open_mapped(path)
        if not lock.exists():
            return conn
        conn.close()
    return _open_locked(run_dir, path)


def _open_locked(run_dir: Path, path: Path) -> sqlite3.Connection:
    """Restore the run and connect while holding its archive lock.

    No archive or restore can run between the restore and the connect, so
    the connection reaches the real database; under the lock a database
    beside an archive is always a stray left by a raced connect, and goes.
    The lock is released once connected. A lock that cannot be taken in
    time, or an archive that cannot be restored, makes the run unreadable:
    readers fall back to the JSON reports. A process that cannot write the
    run folder can neither archive nor restore it and connects unlocked.

    Accepted residual: a connection opened before an archive starts and still
    open after it reads the unlinked file; archives only touch runs untouched
    for the whole warm window.
    """
    try:
        with run_lock_if_writable(run_dir) as locked:
            clone = is_shared_clone_run(run_dir)
            if is_archived(run_dir) and not (clone and unpacked_current(run_dir)):
                if not locked:
                    raise SqliteStoreUnreadableError(f"run archive in {run_dir} cannot be restored here")
                if not clone:  # a clone's unpack keeps the archive and drops the old database itself
                    drop_stray_db_locked(run_dir)
                if not _restored(run_dir):
                    raise SqliteStoreUnreadableError(f"run archive in {run_dir} could not be restored")
            return _open_clone_db(run_dir, path, locked) if clone else _open_mapped(path)
    except OSError as exc:  # a lock wait that timed out included
        raise SqliteStoreUnreadableError(f"run in {run_dir} could not be locked: {exc}") from exc


def _open_clone_db(run_dir: Path, path: Path, locked: bool) -> sqlite3.Connection:
    """Connect to a shared clone run's database only when quodeq created it there, else rebuild it."""
    if not trust_local_db_locked(run_dir, locked):
        raise SqliteStoreUnreadableError(f"the database in {run_dir} was not created here and cannot be rebuilt")
    conn = _open_mapped(path)
    mark_local_db(run_dir, conn)
    return conn


def _restored(run_dir: Path) -> bool:
    try:
        restore_locked(run_dir)
    except RunArchiveError:  # restore_locked already warned
        return False
    except OSError as exc:
        warn_once(run_dir, "Could not restore run archive in %s: %s", run_dir, exc)
        return False
    return True


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
        conn = _open_unarchived(run_dir, path)
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
