"""Map-snapshot rows of the score cache (one JSON payload per project run)."""
from __future__ import annotations

import sqlite3

from quodeq.data.sqlite.score_cache_run_payloads import MAP_SNAPSHOT, load_run_payloads, prune_run_payloads, store_run_payload


def store_map_snapshot(conn: sqlite3.Connection, project: str, run_id: str, key: str, payload: dict) -> None:
    """Persist one run's map snapshot under *key* (best-effort)."""
    store_run_payload(conn, MAP_SNAPSHOT, (project, run_id, key), payload)


def load_map_snapshots(conn: sqlite3.Connection, project: str, keys: dict[str, str]) -> dict[str, dict]:
    """The cached snapshots of *keys*' runs whose stored key still matches; {} on any error."""
    return load_run_payloads(conn, MAP_SNAPSHOT, project, keys)


def prune_map_snapshots(conn: sqlite3.Connection, project: str, keep_run_ids: set[str]) -> None:
    """Drop *project*'s snapshot rows for runs outside *keep_run_ids* (best-effort)."""
    prune_run_payloads(conn, MAP_SNAPSHOT, project, keep_run_ids)
