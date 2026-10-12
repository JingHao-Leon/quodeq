"""Per-run keyed JSON payload tables of the score cache (``run_change``, ``map_snapshot``).

Each table holds one ``(project, run_id, key, payload)`` row per run. Writes and
prunes are best-effort (log and return); reads return {} on any error so the
caller recomputes.
"""
from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass

_logger = logging.getLogger(__name__)

# The only tables these helpers touch: the name is formatted into the SQL, so it never comes from a caller.
_TABLES = frozenset({"run_change", "map_snapshot"})


@dataclass(frozen=True)
class RunPayloadTable:
    """One per-run keyed payload table and how its payloads are serialised."""

    table: str
    separators: tuple[str, str] | None = None  # passed to json.dumps; None keeps its default spacing

    def __post_init__(self) -> None:
        """Refuse any table outside the fixed allow-list."""
        if self.table not in _TABLES:
            raise ValueError(f"not a per-run payload table: {self.table}")


RUN_CHANGE = RunPayloadTable("run_change")
MAP_SNAPSHOT = RunPayloadTable("map_snapshot", separators=(",", ":"))


def store_run_payload(conn: sqlite3.Connection, table: RunPayloadTable, row: tuple[str, str, str], payload: dict) -> None:
    """Persist one run's *payload* under its key; *row* is ``(project, run_id, key)`` (best-effort)."""
    project, run_id, _ = row
    try:
        conn.execute(
            f"INSERT OR REPLACE INTO {table.table} (project, run_id, key, payload) VALUES (?, ?, ?, ?)",
            (*row, json.dumps(payload, separators=table.separators)),
        )
        conn.commit()
    except (sqlite3.Error, TypeError, ValueError):
        _logger.warning("%s write failed for %s/%s", table.table, project, run_id, exc_info=True)


def load_run_payloads(conn: sqlite3.Connection, table: RunPayloadTable, project: str, keys: dict[str, str]) -> dict[str, dict]:
    """The payloads of *keys*' runs whose stored key still matches; {} on any error."""
    try:
        rows = conn.execute(f"SELECT run_id, key, payload FROM {table.table} WHERE project=?", (project,)).fetchall()
    except sqlite3.Error:
        return {}
    out: dict[str, dict] = {}
    for run_id, key, payload in rows:
        if keys.get(run_id) != key:
            continue
        try:
            out[run_id] = json.loads(payload)
        except ValueError:
            continue  # a corrupt row reads as a miss and is rewritten by the caller
    return out


def prune_run_payloads(conn: sqlite3.Connection, table: RunPayloadTable, project: str, keep_run_ids: set[str]) -> None:
    """Drop *project*'s rows for runs outside *keep_run_ids* (best-effort)."""
    try:
        rows = conn.execute(f"SELECT run_id FROM {table.table} WHERE project=?", (project,)).fetchall()
        gone = [(project, run_id) for (run_id,) in rows if run_id not in keep_run_ids]
        if gone:
            conn.executemany(f"DELETE FROM {table.table} WHERE project=? AND run_id=?", gone)
            conn.commit()
    except sqlite3.Error:
        _logger.warning("%s prune failed for %s", table.table, project, exc_info=True)
