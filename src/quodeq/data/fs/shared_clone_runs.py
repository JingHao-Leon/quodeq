"""Runs inside a shared repository's clone: detection, the in-place unpack, the local-database marker, git excludes.

The shared routes read the clone's run folders with the same readers as the
local ones, so a clone run is restored and projected like a local run, with
these differences that keep the clone's working tree matching the remote and
nothing the repository carries trusted:

- the restore keeps ``archive.tar.gz`` (it is tracked) and records the
  archive's size and modification time in an ``unpacked`` marker; while that
  matches and the unpacked files are there, the next restore is a no-op. A
  checkout that rewrites the archive changes its time, and the run is
  unpacked again;
- ``evaluation.db`` is never taken from an archive, and a database is only
  opened when quodeq created it in this clone: the ``local_db`` marker holds
  the file's device and inode, which a checkout writing the file anew
  changes, and a random token the database holds too (a file system may
  hand the freed inode straight back). Anything else is deleted with its
  sidecars and rebuilt from the event log;
- both markers live under ``.git/quodeq/runs/<project>/<run>/``, which no
  commit can carry;
- the run, its project and the evaluations folder must be real folders inside
  the clone, and nothing is restored through a linked ``evidence`` folder;
- ``.git/info/exclude`` keeps the databases, grade stamps and temporary files out of
  ``git status``, so a publish from this clone never stages them.

Every function that changes a run folder runs under the run lock.
"""
from __future__ import annotations

import fnmatch
import json
import logging
import os
import shutil
import sqlite3
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path

from quodeq.data.fs.run_archive_files import (
    ARCHIVE_FILENAME, DB_SIDECARS, EVENTS_NAME, EVIDENCE_DIR, EVIDENCE_PATTERN, is_plain_file, write_json_sidecar,
)
from quodeq.data.fs.grades_stamp_store import GRADES_STAMP_NAME
from quodeq.data.fs.run_archive_guard import warn_once
from quodeq.data.fs.shared_clone_db_token import new_token, read_db_token, write_db_token
from quodeq.data.fs.run_archive_limits import RunArchiveError, check_restore_dirs
from quodeq.data.fs.run_archive_wal import DB_NAME
from quodeq.data.fs.shared_repo_git import EVALUATIONS_DIRNAME, run_git
from quodeq.data.fs.shared_repo_meta import MARKER_FILENAME
from quodeq.shared.constants import GIT_DIR_NAME

_logger = logging.getLogger(__name__)

CLONE_EXCLUDES = (
    DB_NAME, *DB_SIDECARS, GRADES_STAMP_NAME, ".restored_at", ".archive.lock", ".restore.tmp/", "*.tmp",
)
_DB_FILES = (DB_NAME, *DB_SIDECARS)
_MARKER_ROOT = ("quodeq", "runs")

Extractor = Callable[[Path, Path, Sequence[str]], list[str]]


def _clone_root(run_dir: Path) -> Path:
    return run_dir.parent.parent.parent


def is_shared_clone_root(eval_root: Path) -> bool:
    """True when *eval_root* is ``<clone>/evaluations`` in a git clone holding ``quodeq.json``."""
    repo = eval_root.parent
    return (eval_root.name == EVALUATIONS_DIRNAME and (repo / MARKER_FILENAME).is_file()
            and (repo / GIT_DIR_NAME).is_dir())


def is_shared_clone_run(run_dir: Path) -> bool:
    """True when *run_dir* is ``<clone>/evaluations/<project>/<run>`` in a git clone holding ``quodeq.json``."""
    return is_shared_clone_root(run_dir.parent.parent)


def _marker(run_dir: Path, name: str) -> Path:
    return _clone_root(run_dir).joinpath(GIT_DIR_NAME, *_MARKER_ROOT, run_dir.parent.name, run_dir.name, name)


def unpacked_marker(run_dir: Path) -> Path:
    """Where the clone run's ``unpacked`` record lives, inside the clone's ``.git``."""
    return _marker(run_dir, "unpacked")


def local_db_marker(run_dir: Path) -> Path:
    """Where the clone run's ``local_db`` record lives, inside the clone's ``.git``."""
    return _marker(run_dir, "local_db")


def _write_marker(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_json_sidecar(path, payload)


def _read_marker(path: Path) -> dict | None:
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return record if isinstance(record, dict) else None


def clone_run_contained(run_dir: Path) -> bool:
    """True when the run, its project and the evaluations folder are real folders inside the clone."""
    if any(p.is_symlink() for p in (run_dir, run_dir.parent, run_dir.parent.parent)):
        return False
    try:
        return run_dir.resolve().is_relative_to(_clone_root(run_dir).resolve())
    except OSError:
        return False


def _archive_stamp(run_dir: Path) -> dict:
    st = (run_dir / ARCHIVE_FILENAME).stat()
    return {"size": st.st_size, "mtime_ns": st.st_mtime_ns}


def _unpacked_name(name: object) -> bool:
    if name == EVENTS_NAME:
        return True
    folder, _, base = str(name).partition("/")
    return folder == EVIDENCE_DIR and "/" not in base and fnmatch.fnmatchcase(base, EVIDENCE_PATTERN)


def unpacked_current(run_dir: Path) -> bool:
    """True when the ``unpacked`` record matches the archive on disk and every file it lists is there."""
    record = _read_marker(unpacked_marker(run_dir))
    try:
        stamp = _archive_stamp(run_dir)
    except OSError:
        return False
    if record is None or any(record.get(k) != v for k, v in stamp.items()):
        return False
    members = record.get("members")
    if not isinstance(members, list) or EVENTS_NAME not in members:
        return False
    return all(_unpacked_name(m) and is_plain_file(run_dir / m) for m in members)


def _check_destinations(run_dir: Path, names: Sequence[str]) -> None:
    if not clone_run_contained(run_dir):
        raise RunArchiveError(f"{run_dir} is not a folder inside the shared clone")
    check_restore_dirs(run_dir)
    real = run_dir.resolve()
    for name in names:
        if not (run_dir / name).resolve().is_relative_to(real):
            raise RunArchiveError(f"archive member {name!r} would land outside {run_dir}")


def _forget_db(run_dir: Path) -> None:
    for name in _DB_FILES:
        (run_dir / name).unlink(missing_ok=True)
    local_db_marker(run_dir).unlink(missing_ok=True)


def restore_clone_locked(run_dir: Path, staging: Path, extract: Extractor) -> bool:
    """Unpack an archived clone run beside its archive; True when it unpacked, False when already unpacked.

    The caller holds the run lock. ``evaluation.db`` is skipped, and the
    database projected from an earlier unpack goes: the event log it was
    built from may have changed with the archive. Raises ``RunArchiveError``
    when a destination is linked out of the run folder.
    """
    if unpacked_current(run_dir):
        return False
    try:
        _check_destinations(run_dir, ())
        stamp = _archive_stamp(run_dir)  # read first: an archive rewritten meanwhile reads as changed next time
        names = extract(run_dir / ARCHIVE_FILENAME, staging, (DB_NAME,))
        _check_destinations(run_dir, names)
    except RunArchiveError as exc:
        shutil.rmtree(staging, ignore_errors=True)
        warn_once(run_dir, "Refusing to unpack shared run archive: %s", exc)
        raise
    unpacked_marker(run_dir).unlink(missing_ok=True)
    _forget_db(run_dir)
    for name in names:
        dest = run_dir / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        os.replace(staging / name, dest)
    shutil.rmtree(staging, ignore_errors=True)
    _write_marker(unpacked_marker(run_dir), {**stamp, "members": names})
    return True


def _db_identity(run_dir: Path) -> dict | None:
    try:
        st = (run_dir / DB_NAME).lstat()
    except OSError:
        return None
    return {"dev": st.st_dev, "ino": st.st_ino}


def _db_trusted(run_dir: Path) -> bool:
    """True when the database is the file the ``local_db`` record names and holds the record's token."""
    identity = _db_identity(run_dir)
    record = _read_marker(local_db_marker(run_dir))
    if identity is None or record is None or any(record.get(k) != v for k, v in identity.items()):
        return False
    token = record.get("token")
    return isinstance(token, str) and bool(token) and read_db_token(run_dir / DB_NAME) == token


def trust_local_db_locked(run_dir: Path, locked: bool) -> bool:
    """Make the clone run's database one quodeq created; False when it cannot (no lock, or a linked run).

    A database whose device and inode differ from the ``local_db`` record,
    or that lacks the record's token (or without a record), is deleted with
    its sidecars, so the connect that follows creates a fresh one; the
    caller then marks it.
    """
    if not clone_run_contained(run_dir):
        return False
    if _db_trusted(run_dir):
        return True
    if not locked:
        return False
    _forget_db(run_dir)
    return True


def mark_local_db(run_dir: Path, conn: sqlite3.Connection) -> None:
    """Record the clone run's database (open on *conn*) as created here; a failed write only costs a rebuild."""
    if _db_trusted(run_dir):
        return
    token = new_token()
    try:
        write_db_token(conn, token)
    except sqlite3.Error as exc:
        _logger.warning("Could not mark the database of %s as local: %s", run_dir, exc)
        return
    identity = _db_identity(run_dir)
    if identity is None:
        return
    try:
        _write_marker(local_db_marker(run_dir), {**identity, "token": token})
    except OSError as exc:
        _logger.warning("Could not mark the database of %s as local: %s", run_dir, exc)


def write_clone_excludes(clone_root: Path) -> None:
    """Merge ``CLONE_EXCLUDES`` into the clone's ``.git/info/exclude``, keeping every other line."""
    exclude = clone_root / GIT_DIR_NAME / "info" / "exclude"
    try:
        lines = exclude.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        lines = []
    missing = [p for p in CLONE_EXCLUDES if p not in lines]
    if not missing:
        return
    exclude.parent.mkdir(parents=True, exist_ok=True)
    exclude.write_text("\n".join([*lines, *missing]) + "\n", encoding="utf-8")


def _forget_tracked_databases(clone_root: Path, env: Mapping[str, str] | None) -> None:
    """Drop the ``local_db`` record of every run whose database files git tracks.

    The inode check already catches a checkout writing the file anew; this
    covers a file system that hands the freed inode straight back. Only
    records inside ``.git`` are removed, never a tracked file.
    """
    ok, out = run_git(["ls-files", "-z", "--", EVALUATIONS_DIRNAME], cwd=clone_root, env=env)
    if not ok:
        _logger.warning("Could not list the tracked files of %s: %s", clone_root, out.strip()[:200])
        return
    for rel in filter(None, out.split("\0")):
        path = clone_root / rel
        if path.name in _DB_FILES and _clone_root(path.parent) == clone_root:
            local_db_marker(path.parent).unlink(missing_ok=True)


def secure_clone_tree(clone_root: Path, env: Mapping[str, str] | None = None) -> None:
    """Write the clone's git excludes and drop trust in tracked databases: after a clone, ensure, reset or pull."""
    if not (clone_root / GIT_DIR_NAME).is_dir():
        return
    try:
        write_clone_excludes(clone_root)
    except OSError as exc:
        _logger.warning("Could not write the git excludes of %s: %s", clone_root, exc)
    _forget_tracked_databases(clone_root, env)
