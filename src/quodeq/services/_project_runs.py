"""One project's runs from the run index, without touching the other projects.

The full listing syncs every project's run dirs and builds a snapshot (one
``status.json`` read) for every run of every project. History polls one
project every few seconds, so it syncs and reads that project only.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from quodeq.core.types.job import JobSnapshot
from quodeq.services._run_index_fs import merge_internal_jobs
from quodeq.services._run_status_readers import build_job_snapshot
from quodeq.services.wiring import list_runs_for_project
from quodeq.services.wiring_sync import sync_project


def project_snapshots(
    db: sqlite3.Connection, reports_root: Path, project: str, internal_jobs: list[JobSnapshot],
) -> list[JobSnapshot]:
    """*project*'s runs newest first, merged with its in-memory jobs; closes *db*."""
    try:
        sync_project(db, reports_root / project, project)
        rows = list_runs_for_project(db, project, limit=None)
    finally:
        db.close()
    own = [j for j in internal_jobs if j.output_project == project]
    merged = merge_internal_jobs([build_job_snapshot(r, with_logs=False) for r in rows], own)
    return sorted(merged, key=lambda s: s.started_at or "", reverse=True)
