"""Reads and writes of ``run_principle_scalars``, the per-principle companion of ``run_scalars``.

One row per (project, run, version, dimension, principle) with the principle's
score, grade, thin-evidence marker and active-violation counts, written and
deleted together with the run's ``run_scalars`` rows so a hit on either
version carries both. A row written before the counts were stored has NULL
counts and reads back with them unknown (``PrincipleGrade.counts`` None).

The store attaches them to the row dimensions it reads. The history-context
shape drops them again (``score_cache_rows.scalar_dimension``); the trend
reads the rows themselves for its per-principle series.
"""
from __future__ import annotations

import sqlite3
from dataclasses import replace

from quodeq.core.types import DimensionResult
from quodeq.core.types.report import PrincipleCounts, PrincipleGrade
from quodeq.core.types.severity import Severity

#: The count columns after ``confidence``, in SELECT and INSERT order; NULL
#: when the counts are unknown. Added by migration to a table created before them.
PRINCIPLE_COUNT_COLUMNS: tuple[str, ...] = ("violation_count", Severity.CRITICAL.value, Severity.MAJOR.value)
#: The columns after the key that a table created before them lacks, with their SQL type.
PRINCIPLE_ADDED_COLUMNS: dict[str, str] = {
    "confidence": "TEXT", **{column: "INTEGER" for column in PRINCIPLE_COUNT_COLUMNS},
}
#: Every column after ``dimension``, in SELECT and INSERT order.
_VALUE_COLUMN_NAMES: tuple[str, ...] = ("principle", "score", "grade", "confidence", *PRINCIPLE_COUNT_COLUMNS)
_VALUE_COLUMNS = ", ".join(_VALUE_COLUMN_NAMES)
_VALUE_PLACEHOLDERS = ", ".join("?" * len(_VALUE_COLUMN_NAMES))

#: One row to write: ``(dimension, principle, score, grade, confidence, violations, critical, major)``.
PrincipleRow = tuple[str, str, str | None, str | None, str | None, int | None, int | None, int | None]


def _count_values(counts: PrincipleCounts | None) -> tuple[int | None, int | None, int | None]:
    """*counts* as ``PRINCIPLE_COUNT_COLUMNS`` values: NULLs when unknown."""
    if counts is None:
        return None, None, None
    return counts.violations, counts.critical, counts.major


def principle_rows(dims: list[DimensionResult]) -> list[PrincipleRow]:
    """The principle rows of *dims*, skipping unnamed principles and dimensions."""
    return [(d.dimension, p.principle, p.score, p.grade, p.confidence, *_count_values(p.counts))
            for d in dims if d.dimension for p in d.principles if p.principle]


def write_principle_rows(
    conn: sqlite3.Connection, project: str, run_id: str, version: str, rows: list[PrincipleRow],
) -> None:
    """Replace the run's principle rows with *rows* at *version*. Does not commit."""
    conn.execute("DELETE FROM run_principle_scalars WHERE project=? AND run_id=?", (project, run_id))
    conn.executemany(
        "INSERT OR REPLACE INTO run_principle_scalars"
        f" (project, run_id, version, dimension, {_VALUE_COLUMNS})"
        f" VALUES (?, ?, ?, ?, {_VALUE_PLACEHOLDERS})",
        [(project, run_id, version, *row) for row in rows],
    )


#: Principle grades per dimension, keyed by (run_id, version).
PrinciplesByKey = dict[tuple[str, str], dict[str, list[PrincipleGrade]]]


def read_principle_rows(
    conn: sqlite3.Connection, project: str, run_id: str | None = None,
) -> PrinciplesByKey:
    """The project's (or one run's) principle grades, keyed by (run_id, version) then dimension.

    Raises ``sqlite3.Error`` like any other read; the store's callers already
    degrade on it.
    """
    sql = (f"SELECT run_id, version, dimension, {_VALUE_COLUMNS}"
           " FROM run_principle_scalars"
           " WHERE project=?")
    args: tuple = (project,)
    if run_id is not None:
        sql, args = sql + " AND run_id=?", (project, run_id)
    out: PrinciplesByKey = {}
    for rid, ver, dim, *values in conn.execute(sql + " ORDER BY rowid", args):
        out.setdefault((rid, ver), {}).setdefault(dim, []).append(_principle_from_values(values))
    return out


def _principle_from_values(values: list) -> PrincipleGrade:
    """One ``_VALUE_COLUMNS`` row as a principle grade; NULL counts read as unknown, never zeros."""
    principle, score, grade, confidence, violations, critical, major = values
    counts = None if violations is None else PrincipleCounts(violations, critical or 0, major or 0)
    return PrincipleGrade(principle=principle, score=score, grade=grade, confidence=confidence, counts=counts)


def attach_principles(
    dims: list[DimensionResult], by_dimension: dict[str, list[PrincipleGrade]],
) -> list[DimensionResult]:
    """*dims* each carrying its principle grades from *by_dimension* (none when absent)."""
    return [replace(d, principles=list(by_dimension.get(d.dimension, ()))) for d in dims]
