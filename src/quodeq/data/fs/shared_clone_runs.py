"""Runs inside a shared repository's clone: detection, the in-place unpack, the local-database marker, git excludes.

The shared routes read the clone's run folders with the same readers as the
local ones, so a clone run is restored and projected like a local run, with
three differences that keep the clone's working tree matching the remote:

- the restore keeps ``archive.tar.gz`` (it is tracked) and records the
  archive's size and modification time in ``.unpacked``; while that matches
  and the unpacked files are there, the next restore is a no-op. A checkout
  that rewrites the archive changes its time, and the run is unpacked again;
- ``evaluation.db`` is never taken from an archive, and a database is only
  opened when quodeq created it in this clone (``.local_db``). Anything else
  named ``evaluation.db`` (force-added in the repository, left by an older
  build) is deleted with its sidecars and rebuilt from the event log;
- ``.git/info/exclude`` keeps the databases, markers and temporary files out
  of ``git status``, so a publish from this clone never stages them.

Every function that changes a run folder runs under the run lock.
"""
from __future__ import annotations

import fnmatch
import json
import logging
import os
import shutil
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path

from quodeq.data.fs.run_archive_files import (
    ARCHIVE_FILENAME, DB_SIDECARS, EVENTS_NAME, EVIDENCE_DIR, EVIDENCE_PATTERN, is_plain_file, write_json_sidecar,
)
from quodeq.data.fs.run_archive_guard import warn_once
from quodeq.data.fs.run_archive_limits import RunArchiveError
from quodeq.data.fs.run_archive_wal import DB_NAME
from quodeq.data.fs.shared_repo_git import EVALUATIONS_DIRNAME, run_git
from quodeq.data.fs.shared_repo_meta import MARKER_FILENAME
from quodeq.shared.constants import GIT_DIR_NAME

_logger = logging.getLogger(__name__)

UNPACKED_MARKER = ".unpacked"
LOCAL_DB_MARKER = ".local_db"
CLONE_EXCLUDES = (
    DB_NAME, *DB_SIDECARS, ".restored_at", ".archive.lock", ".restore.tmp/", UNPACKED_MARKER, LOCAL_DB_MARKER, "*.tmp",
)
_DB_FILES = (DB_NAME, *DB_SIDECARS)
_MARKERS = (UNPACKED_MARKER, LOCAL_DB_MARKER)

Extractor = Callable[[Path, Path, Sequence[str]], list[str]]


def is_shared_clone_run(run_dir: Path) -> bool:
    """True when *run_dir* is ``<clone>/evaluations/<project>/<run>`` in a git clone holding ``quodeq.json``."""
    root = run_dir.parent.parent
    repo = root.parent
    return root.name == EVALUATIONS_DIRNAME and (repo / MARKER_FILENAME).is_file() and (repo / GIT_DIR_NAME).exists()


def _archive_stamp(run_dir: Path) -> dict:
    st = (run_dir / ARCHIVE_FILENAME).stat()
    return {"size": st.st_size, "mtime_ns": st.st_mtime_ns}


def _unpacked_name(name: object) -> bool:
    if name == EVENTS_NAME:
        return True
    folder, _, base = str(name).partition("/")
    return folder == EVIDENCE_DIR and "/" not in base and fnmatch.fnmatchcase(base, EVIDENCE_PATTERN)


def unpacked_current(run_dir: Path) -> bool:
    """True when ``.unpacked`` matches the archive on disk and every file it lists is there."""
    try:
        record = json.loads((run_dir / UNPACKED_MARKER).read_text(encoding="utf-8"))
        stamp = _archive_stamp(run_dir)
    except (OSError, ValueError):
        return False
    if not isinstance(record, dict) or any(record.get(k) != v for k, v in stamp.items()):
        return False
    members = record.get("members")
    if not isinstance(members, list) or EVENTS_NAME not in members:
        return False
    return all(_unpacked_name(m) and is_plain_file(run_dir / m) for m in members)


def _unlink_all(run_dir: Path, names: Sequence[str]) -> None:
    for name in names:
        (run_dir / name).unlink(missing_ok=True)


def restore_clone_locked(run_dir: Path, staging: Path, extract: Extractor) -> bool:
    """Unpack an archived clone run beside its archive; True when it unpacked, False when already unpacked.

    The caller holds the run lock. ``evaluation.db`` is skipped, and the
    database projected from an earlier unpack goes: the event log it was
    built from may have changed with the archive.
    """
    if unpacked_current(run_dir):
        return False
    stamp = _archive_stamp(run_dir)  # read first: an archive rewritten meanwhile reads as changed next time
    try:
        names = extract(run_dir / ARCHIVE_FILENAME, staging, (DB_NAME,))
    except RunArchiveError as exc:
        warn_once(run_dir, "Refusing to unpack shared run archive: %s", exc)
        raise
    _unlink_all(run_dir, (*_MARKERS, *_DB_FILES))
    for name in names:
        dest = run_dir / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        os.replace(staging / name, dest)
    shutil.rmtree(staging, ignore_errors=True)
    write_json_sidecar(run_dir / UNPACKED_MARKER, {**stamp, "members": names})
    return True


def trust_local_db_locked(run_dir: Path, locked: bool) -> bool:
    """Make the clone run's database one quodeq created; False when it cannot (no lock held).

    Without ``.local_db`` any database and sidecars there are deleted, so the
    connect that follows creates a fresh one; the caller then marks it.
    """
    if (run_dir / LOCAL_DB_MARKER).is_file():
        return True
    if not locked:
        return False
    _unlink_all(run_dir, _DB_FILES)
    return True


def mark_local_db(run_dir: Path) -> None:
    """Record that quodeq created the clone run's database; a failed write only costs a rebuild."""
    try:
        (run_dir / LOCAL_DB_MARKER).touch()
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


def forget_tracked_markers(clone_root: Path, env: Mapping[str, str] | None = None) -> None:
    """Drop the trust a checkout may have broken: tracked markers, and ``.local_db`` beside a tracked database.

    A tracked database is checked out over the local one by a reset, and a
    tracked marker was never written here; both must read as foreign.
    """
    ok, out = run_git(["ls-files", "-z", "--", EVALUATIONS_DIRNAME], cwd=clone_root, env=env)
    if not ok:
        _logger.warning("Could not list the tracked files of %s: %s", clone_root, out.strip()[:200])
        return
    for rel in filter(None, out.split("\0")):
        path = clone_root / rel
        if path.name in _DB_FILES:
            (path.parent / LOCAL_DB_MARKER).unlink(missing_ok=True)
        elif path.name in _MARKERS:
            path.unlink(missing_ok=True)


def prepare_clone(clone_root: Path, env: Mapping[str, str] | None = None) -> None:
    """``write_clone_excludes`` and ``forget_tracked_markers``: after every clone, ensure and reset."""
    if not (clone_root / GIT_DIR_NAME).is_dir():
        return
    try:
        write_clone_excludes(clone_root)
    except OSError as exc:
        _logger.warning("Could not write the git excludes of %s: %s", clone_root, exc)
    forget_tracked_markers(clone_root, env)
