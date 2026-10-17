"""Make an imported archived run a plain local archived run.

A run pulled from a shared clone can arrive with its archive and the files the
archive was unpacked into beside it. Keeping both would read as an archived run
whose restore overwrites the unpacked copies, so the archive stays and the
unpacked copies go, along with any database or marker file.
"""
from __future__ import annotations

import shutil
from pathlib import Path

# The names a run archive and its unpacked copies go by (data/fs/run_archive_files.py owns them;
# services reach data only through wiring, and this module only deletes by name).
_ARCHIVE = "archive.tar.gz"
_UNPACKED = ("events.jsonl", "evaluation.db", "evaluation.db-wal", "evaluation.db-shm")
_EVIDENCE_GLOB = "evidence/*_evidence.jsonl"


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


def normalize_archived_runs(project: Path) -> None:
    """Keep only the archive form in every archived run under *project*."""
    for archive in project.glob(f"*/{_ARCHIVE}"):
        if archive.is_file() and not archive.is_symlink():
            _tidy_archived_run(archive.parent)
