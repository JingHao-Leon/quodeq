"""Map-snapshot rows of the score cache (one JSON payload per project run).

The cache is only an accelerator: these functions open it themselves, log and
swallow storage errors, and hand back run snapshots, so a caller never sees
the storage driver or the stored layout (one positional list per file).
"""
from __future__ import annotations

import logging
import sqlite3

from quodeq.core.map_history.snapshot import FileStat, RunSnapshot
from quodeq.data.sqlite.score_cache_db import open_score_cache
from quodeq.data.sqlite.score_cache_run_payloads import MAP_SNAPSHOT, load_run_payloads, prune_run_payloads, store_run_payloads

_logger = logging.getLogger(__name__)


def _encoded(snapshot: RunSnapshot) -> dict:
    """The stored form of *snapshot*: one positional list per file."""
    return {"dims": list(snapshot.dims), "files": {
        p: [s.critical, s.major, s.minor, s.compliance, s.weight, sorted(s.ids), sorted(s.dims)]
        for p, s in snapshot.files.items()}}


def _decoded(payload: dict) -> RunSnapshot | None:
    """Inverse of ``_encoded``; None when *payload* does not have its layout (the caller rebuilds the run)."""
    try:
        return RunSnapshot(tuple(payload["dims"]), {
            p: FileStat(c, ma, mi, co, w, frozenset(ids), frozenset(ds))
            for p, (c, ma, mi, co, w, ids, ds) in payload["files"].items()})
    except (KeyError, ValueError, TypeError):
        return None  # a row from an older or corrupt layout reads as a miss


def load_map_snapshots(project: str, keys: dict[str, str]) -> dict[str, RunSnapshot]:
    """The cached snapshots of *keys*' runs (``run_id -> key``) whose stored key still matches and that decode.

    {} when the cache cannot be opened or read (logged): the caller rebuilds.
    """
    try:
        with open_score_cache() as conn:
            payloads = load_run_payloads(conn, MAP_SNAPSHOT, project, keys)
    except (sqlite3.Error, OSError):
        _logger.warning("map snapshot cache unavailable for %s", project, exc_info=True)
        return {}
    return {run_id: snap for run_id, payload in payloads.items() if (snap := _decoded(payload)) is not None}


def save_map_snapshots(project: str, snapshots: dict[str, tuple[str, RunSnapshot]], keep_run_ids: set[str]) -> None:
    """Drop *project*'s snapshot rows outside *keep_run_ids*, then store *snapshots* (``run_id -> (key, snapshot)``) in one transaction.

    Best-effort: a cache that cannot be opened or written is logged and left as it is.
    """
    payloads = {run_id: (key, _encoded(snap)) for run_id, (key, snap) in snapshots.items()}
    try:
        with open_score_cache() as conn:
            prune_run_payloads(conn, MAP_SNAPSHOT, project, keep_run_ids)
            store_run_payloads(conn, MAP_SNAPSHOT, project, payloads)
    except (sqlite3.Error, OSError):
        _logger.warning("map snapshot cache not written for %s", project, exc_info=True)
