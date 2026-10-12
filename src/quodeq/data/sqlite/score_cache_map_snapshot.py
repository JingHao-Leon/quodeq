"""Map-snapshot rows of the score cache (one JSON payload per project run)."""
from __future__ import annotations

import json
import logging
import sqlite3

_logger = logging.getLogger(__name__)


def store_map_snapshot(conn: sqlite3.Connection, project: str, run_id: str, key: str, payload: dict) -> None:
    """Persist one run's map snapshot under *key* (best-effort)."""
    try:
        conn.execute(
            "INSERT OR REPLACE INTO map_snapshot (project, run_id, key, payload) VALUES (?, ?, ?, ?)",
            (project, run_id, key, json.dumps(payload, separators=(",", ":"))),
        )
        conn.commit()
    except (sqlite3.Error, TypeError, ValueError):
        _logger.warning("map_snapshot write failed for %s/%s", project, run_id, exc_info=True)


def load_map_snapshots(conn: sqlite3.Connection, project: str, keys: dict[str, str]) -> dict[str, dict]:
    """The cached snapshots of *keys*' runs whose stored key still matches; {} on any error."""
    try:
        rows = conn.execute("SELECT run_id, key, payload FROM map_snapshot WHERE project=?", (project,)).fetchall()
    except sqlite3.Error:
        return {}
    out: dict[str, dict] = {}
    for run_id, key, payload in rows:
        if keys.get(run_id) == key:
            try:
                out[run_id] = json.loads(payload)
            except ValueError:
                continue
    return out


def prune_map_snapshots(conn: sqlite3.Connection, project: str, keep_run_ids: set[str]) -> None:
    """Drop *project*'s snapshot rows for runs outside *keep_run_ids* (best-effort)."""
    try:
        rows = conn.execute("SELECT run_id FROM map_snapshot WHERE project=?", (project,)).fetchall()
        gone = [(project, run_id) for (run_id,) in rows if run_id not in keep_run_ids]
        if gone:
            conn.executemany("DELETE FROM map_snapshot WHERE project=? AND run_id=?", gone)
            conn.commit()
    except sqlite3.Error:
        _logger.warning("map_snapshot prune failed for %s", project, exc_info=True)
