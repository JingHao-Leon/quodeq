"""One project's runs from the run index, without touching the other projects.

The full listing syncs every project's run dirs and builds a snapshot (one
``status.json`` read) for every run of every project. History polls one
project every few seconds, so it syncs and reads that project only.
"""
from __future__ import annotations

from quodeq.core.types.job import JobSnapshot
from quodeq.services._run_index_fs import merge_internal_jobs
from quodeq.services._run_status_readers import build_job_snapshot
from quodeq.services.wiring import RunRow


def project_snapshots(rows: list[RunRow], project: str, internal_jobs: list[JobSnapshot]) -> list[JobSnapshot]:
    """*project*'s indexed *rows* as snapshots newest first, merged with its in-memory jobs."""
    own = [j for j in internal_jobs if j.output_project == project]
    merged = merge_internal_jobs([build_job_snapshot(r, with_logs=False) for r in rows], own)
    return sorted(merged, key=lambda s: s.started_at or "", reverse=True)
