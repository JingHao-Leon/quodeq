"""Make an imported archived run a plain local archived run.

A run pulled from a shared clone can arrive with its archive and the files the
archive was unpacked into beside it. Keeping both would read as an archived run
whose restore overwrites the unpacked copies, so the archive stays and the
unpacked copies go, along with any database or marker file.

The archive itself came from someone else's repository: it is repacked with
its event log and evidence only, so no database it carries is ever opened
here. An archive that fails the safety checks drops its run from the import;
the other runs are kept.
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.services.wiring_sync import (
    ARCHIVE_FILENAME, DB_NAME, DB_SIDECARS, EVENTS_NAME, RunArchiveError, repack_without_db,
)

_UNPACKED = (EVENTS_NAME, DB_NAME, *DB_SIDECARS)
_EVIDENCE_GLOB = "evidence/*_evidence.jsonl"
_REPACKED = f"{ARCHIVE_FILENAME}.repacked"


def _drop(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path, ignore_errors=True)
    else:
        path.unlink(missing_ok=True)


def _tidy_archived_run(run: Path) -> None:
    for name in _UNPACKED:
        _drop(run / name)
    for path in run.glob(_EVIDENCE_GLOB):
        _drop(path)
    for path in run.iterdir():
        if path.name.startswith(".") or path.name.endswith(".tmp"):
            _drop(path)


def _repack(run: Path, log: LogSink) -> None:
    """Replace the run's archive with one holding its logs only; drop the run when the archive is unsafe."""
    archive, repacked = run / ARCHIVE_FILENAME, run / _REPACKED
    try:
        repack_without_db(archive, repacked)
    except RunArchiveError as exc:
        repacked.unlink(missing_ok=True)
        log.warning(f"import: leaving out run {run.name}, its archive is unsafe ({exc})")
        shutil.rmtree(run, ignore_errors=True)
        return
    os.replace(repacked, archive)


def normalize_archived_runs(project: Path, *, log: LogSink = NULL_LOG) -> None:
    """Keep only the archive form, without a database, in every archived run under *project*."""
    for archive in project.glob(f"*/{ARCHIVE_FILENAME}"):
        if archive.is_file() and not archive.is_symlink():
            _tidy_archived_run(archive.parent)
            _repack(archive.parent, log)
