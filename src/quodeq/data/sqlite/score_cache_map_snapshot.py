"""Map-history rows of the score cache: raw runs (``map_snapshot``) and the records they refer to (``map_finding``).

The cache is only an accelerator: these functions open it themselves, log and
swallow storage errors, and hand back core values, so a caller never sees the
storage driver or the stored layout. Records are written before the runs that
refer to them, and a run whose records are not all held reads as a miss.
"""
from __future__ import annotations

import logging
import sqlite3

from quodeq.core.map_history.raw_run import RawFile, RawHistory, RawHistoryWrite, RawRun, ViolationRecord
from quodeq.data.sqlite.score_cache_db import open_score_cache
from quodeq.data.sqlite.score_cache_map_findings import load_map_findings, store_map_findings
from quodeq.data.sqlite.score_cache_run_payloads import (
    MAP_SNAPSHOT, load_run_payloads, prune_run_payloads, store_run_payloads,
)

_logger = logging.getLogger(__name__)
_EMPTY = RawHistory({}, {})


def _encoded(run: RawRun) -> dict:
    """The stored form of *run*: ``{dims, files: {path: [compliance, [record keys], [marks]]}}``."""
    return {"dims": list(run.dims),
            "files": {p: [f.compliance, list(f.violations), list(f.marks)] for p, f in run.files.items()}}


def _texts(items: tuple) -> bool:
    """Whether every item is text (a record key or a mark)."""
    return all(isinstance(i, str) for i in items)


def _decoded(payload: dict) -> RawRun | None:
    """Inverse of ``_encoded``; None when *payload* has another layout (the caller rebuilds the run)."""
    try:
        files = {p: RawFile(tuple(v), int(c), tuple(m)) for p, (c, v, m) in payload["files"].items()}
        if not all(_texts(f.violations) and _texts(f.marks) for f in files.values()):
            return None
        return RawRun(tuple(payload["dims"]), files)
    except (KeyError, ValueError, TypeError, AttributeError, OverflowError):
        return None


def _complete(runs: dict[str, RawRun], records: dict[str, ViolationRecord]) -> dict[str, RawRun]:
    """The runs whose every record is held."""
    return {run_id: run for run_id, run in runs.items()
            if all(key in records for raw in run.files.values() for key in raw.violations)}


def load_map_snapshots(project: str, keys: dict[str, str]) -> RawHistory:
    """The stored runs of *keys* (``run_id -> key``) whose key still matches, with their records.

    A run that does not decode, or refers to a record the store does not hold, is left out (a miss).
    Empty when the cache cannot be opened or read (logged): the caller rebuilds.
    """
    try:
        with open_score_cache() as conn:
            payloads = load_run_payloads(conn, MAP_SNAPSHOT, project, keys)
            records = load_map_findings(conn, project) if payloads else {}
    except (sqlite3.Error, OSError):
        _logger.warning("map snapshot cache unavailable for %s", project, exc_info=True)
        return _EMPTY
    runs = {run_id: run for run_id, payload in payloads.items() if (run := _decoded(payload)) is not None}
    return RawHistory(_complete(runs, records), records)


def save_map_snapshots(project: str, write: RawHistoryWrite) -> None:
    """Store *write*'s records and fresh runs and drop what it does not keep (best-effort, logged)."""
    payloads = {run_id: (key, _encoded(run)) for run_id, (key, run) in write.runs.items()}
    try:
        with open_score_cache() as conn:
            store_map_findings(conn, project, write.records, write.keep_records)
            prune_run_payloads(conn, MAP_SNAPSHOT, project, write.keep_runs)
            store_run_payloads(conn, MAP_SNAPSHOT, project, payloads)
    except (sqlite3.Error, OSError):
        _logger.warning("map snapshot cache not written for %s", project, exc_info=True)
