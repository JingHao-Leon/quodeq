"""The grade-table reads of a run database, on a connection the caller owns.

``SQLiteStateStore`` reads through these, and so does the archive's
``scalars.json`` sidecar (an immutable connection under the run lock), so the
two can never disagree on what a run's grades are.
"""
from __future__ import annotations

import sqlite3

_SELECT_DIMENSION_SCORES = (
    "SELECT dimension, score, grade, exit_reason, files_read, source_count, coverage_pct, confidence "
    "FROM dimension_scores ORDER BY dimension"
)
_SELECT_PRINCIPLE_GRADES = (
    "SELECT dimension, principle_id, score, grade, finding_count, dismissed_count, confidence "
    "FROM principle_grades ORDER BY dimension, principle_id"
)


def select_dimension_scores(conn: sqlite3.Connection) -> list[dict]:
    """Every ``dimension_scores`` row as a dict, ordered by dimension."""
    return [
        {"dimension": r[0], "score": r[1], "grade": r[2], "exit_reason": r[3],
         "files_read": r[4], "source_count": r[5], "coverage_pct": r[6], "confidence": r[7]}
        for r in conn.execute(_SELECT_DIMENSION_SCORES).fetchall()
    ]


def select_principle_grades(conn: sqlite3.Connection) -> list[dict]:
    """The ``principle_grades`` rows as dicts, ordered by dimension then id."""
    return [
        {"dimension": r[0], "principle_id": r[1], "score": r[2], "grade": r[3],
         "finding_count": r[4], "dismissed_count": r[5], "confidence": r[6]}
        for r in conn.execute(_SELECT_PRINCIPLE_GRADES).fetchall()
    ]
