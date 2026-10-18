"""Run-directory removal, reports-root scanning and run dimension listing.

These are plain filesystem operations (rmtree, directory scans) with no
run-index business logic of their own, so they belong in the data layer.
``services/_run_index_fs.py`` re-exports both (via ``services/wiring.py``)
for its callers.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from quodeq.data.fs.report_parser.report_files import list_report_files
from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.core.utils.io import is_within
from quodeq.shared.constants import EVIDENCE_DIRNAME

_EVALUATION_DIRNAME = "evaluation"
_EVIDENCE_SUFFIX = "_evidence.jsonl"


def remove_run_directory(
    reports_dir: Path, output_project: str | None, run_uuid: str,
    *, log: LogSink = NULL_LOG,
) -> bool:
    """Remove a run's on-disk directory. Returns True if removed.

    Tries the known project dir first (fast path when the snapshot carries
    ``output_project``); falls back to scanning every project dir under
    ``reports_dir`` for a ``run_uuid`` match.
    """
    removed_dir = False
    if output_project and reports_dir.is_dir():
        candidate = reports_dir / output_project / run_uuid
        if is_within(candidate, reports_dir) and candidate.is_dir():
            removed_dir = _remove_and_verify(candidate, log)
    if not removed_dir:
        found = scan_reports_root_for_run(reports_dir, run_uuid)
        if found is not None:
            removed_dir = _remove_and_verify(found, log)
    return removed_dir


def _remove_and_verify(run_dir: Path, log: LogSink) -> bool:
    """rmtree *run_dir*; True when it is gone, else warn and return False."""
    shutil.rmtree(run_dir, ignore_errors=True)
    if run_dir.exists():
        log.warning(f"Could not remove run directory {run_dir}")
        return False
    return True


def scan_reports_root_for_run(reports_root: Path | None, run_id: str) -> Path | None:
    """Scan *reports_root* for ``<project>/<run_id>/``, jailed to *reports_root*."""
    if reports_root is None or not reports_root.is_dir():
        return None
    for project_dir in reports_root.iterdir():
        if not project_dir.is_dir():
            continue
        candidate = project_dir / run_id
        if not is_within(candidate, reports_root):
            continue
        if candidate.is_dir():
            return candidate
    return None


def project_run_dirs(project_dir: Path) -> list[Path]:
    """The run folders of *project_dir* (non-hidden subdirectories); [] when unreadable."""
    return [e for e in _entries(project_dir) if e.is_dir() and not e.name.startswith(".")]


def run_listing_stamp(run_dir: Path) -> tuple[int, int]:
    """mtimes of the two folders ``run_dimension_ids`` lists (0 when absent).

    A file added or removed in either folder changes it, so a caller can
    memoize the listing on this stamp.
    """
    return _mtime_ns(run_dir / _EVALUATION_DIRNAME), _mtime_ns(run_dir / EVIDENCE_DIRNAME)


def _mtime_ns(path: Path) -> int:
    try:
        return path.stat().st_mtime_ns
    except OSError:
        return 0


def run_dimension_ids(run_dir: Path) -> frozenset[str]:
    """Lowercase ids of the dimensions *run_dir* analysed, from listings only.

    A finished run leaves ``evaluation/<dim>.json``; a run still in progress
    has at least ``evidence/<dim>_evidence.jsonl``. Missing folders and other
    files contribute nothing.
    """
    ids = {dimension.lower() for dimension, _ in list_report_files(run_dir / _EVALUATION_DIRNAME)}
    ids |= {
        p.name[: -len(_EVIDENCE_SUFFIX)].lower()
        for p in _entries(run_dir / EVIDENCE_DIRNAME) if p.name.endswith(_EVIDENCE_SUFFIX)
    }
    return frozenset(ids)


def _entries(directory: Path) -> list[Path]:
    try:
        return list(directory.iterdir())
    except OSError:
        return []
