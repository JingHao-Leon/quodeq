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
from typing import NamedTuple

_logger = logging.getLogger(__name__)

# The only tables these helpers touch: the name is formatted into the SQL, so it never comes from a caller.
_TABLES = frozenset({"run_change", "map_snapshot"})
# Run ids bound per SELECT, well under SQLite's smallest host-parameter limit (999).
_MAX_BOUND_IDS = 500


@dataclass(frozen=True)
class RunPayloadTable:
    """One per-run keyed payload table and how its payloads are serialised."""

    table: str
    separators: tuple[str, str] | None = None  # passed to json.dumps; None keeps its default spacing

    def __post_init__(self) -> None:
        """Refuse any table outside the fixed allow-list."""
        if self.table not in _TABLES:
            raise ValueError(f"not a per-run payload table: {self.table}")


class RunKey(NamedTuple):
    """Where one run's payload is filed: its project, its run and the cache key it was built under."""

    project: str
    run_id: str
    key: str


RUN_CHANGE = RunPayloadTable("run_change")
MAP_SNAPSHOT = RunPayloadTable("map_snapshot", separators=(",", ":"))


def _serialised(table: RunPayloadTable, project: str, run_id: str, payload: dict) -> str | None:
    """*payload* as stored JSON, or None (logged) when it cannot be serialised."""
    try:
        return json.dumps(payload, separators=table.separators)
    except (TypeError, ValueError):
        _logger.warning("%s payload for %s/%s is not JSON-serialisable", table.table, project, run_id, exc_info=True)
        return None


def store_run_payloads(conn: sqlite3.Connection, table: RunPayloadTable, project: str,
                       payloads: dict[str, tuple[str, dict]]) -> None:
    """Persist *payloads* (``run_id -> (key, payload)``) in one transaction (best-effort).

    A payload that cannot be serialised is skipped (logged); the rest are stored.
    """
    rows = [(project, run_id, key, text) for run_id, (key, payload) in payloads.items()
            if (text := _serialised(table, project, run_id, payload)) is not None]
    if not rows:
        return
    try:
        conn.executemany(f"INSERT OR REPLACE INTO {table.table} (project, run_id, key, payload) VALUES (?, ?, ?, ?)", rows)
        conn.commit()
    except sqlite3.Error:
        _logger.warning("%s write failed for %s", table.table, project, exc_info=True)


def store_run_payload(conn: sqlite3.Connection, table: RunPayloadTable, row: RunKey, payload: dict) -> None:
    """Persist one run's *payload* under *row*'s key (best-effort)."""
    store_run_payloads(conn, table, row.project, {row.run_id: (row.key, payload)})


def _chunks(run_ids: list[str]) -> list[list[str]]:
    """*run_ids* split so no query binds more than ``_MAX_BOUND_IDS`` of them."""
    return [run_ids[i:i + _MAX_BOUND_IDS] for i in range(0, len(run_ids), _MAX_BOUND_IDS)]


def _matching_rows(conn: sqlite3.Connection, table: RunPayloadTable, project: str,
                   keys: dict[str, str]) -> list[tuple[str, str, str]]:
    """``(run_id, key, payload)`` rows of *keys*' runs only (the key is checked by the caller)."""
    rows: list[tuple[str, str, str]] = []
    for chunk in _chunks(sorted(keys)):
        marks = ",".join("?" * len(chunk))
        rows.extend(conn.execute(
            f"SELECT run_id, key, payload FROM {table.table} WHERE project=? AND run_id IN ({marks})",
            (project, *chunk)).fetchall())
    return rows


def load_run_payloads(conn: sqlite3.Connection, table: RunPayloadTable, project: str, keys: dict[str, str]) -> dict[str, dict]:
    """The payloads of *keys*' runs whose stored key still matches; {} on any error."""
    try:
        rows = _matching_rows(conn, table, project, keys)
    except sqlite3.Error:
        _logger.warning("%s read failed for %s", table.table, project, exc_info=True)
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
