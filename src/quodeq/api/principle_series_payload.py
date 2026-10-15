"""The principle series' JSON shape: camelCase keys, scores as numbers.

``{ dimension, rows: [{ runId, dateISO, dateLabel, principles: [{ principle,
score, grade, critical, majors, violations }] }] }``, rows newest first.
``score`` is the number the principle grade shows; ``majors`` counts
criticals and majors, as a dimension's does; the counts are null when the
run's cached row predates them (unknown, not zero).
"""
from __future__ import annotations

from typing import TypedDict

from quodeq.core.scoring.report_grades import parse_numeric_score
from quodeq.core.types.principle_series import PrincipleSeries, PrincipleSeriesRun
from quodeq.core.types.report import PrincipleGrade


class PrincipleDetail(TypedDict):
    """One principle's point in one run."""
    principle: str
    score: float | None
    grade: str | None
    critical: int | None
    majors: int | None
    violations: int | None


class PrincipleSeriesRow(TypedDict):
    """One run that scored the dimension."""
    runId: str
    dateISO: str | None
    dateLabel: str
    principles: list[PrincipleDetail]


class PrincipleSeriesPayload(TypedDict):
    """The response body."""
    dimension: str
    rows: list[PrincipleSeriesRow]


def _principle(p: PrincipleGrade) -> PrincipleDetail:
    counts = p.counts
    return {
        "principle": p.principle or "",
        "score": parse_numeric_score(p.score) if p.score else None,
        "grade": p.grade,
        "critical": counts.critical if counts else None,
        "majors": counts.majors if counts else None,
        "violations": counts.violations if counts else None,
    }


def _row(run: PrincipleSeriesRun) -> PrincipleSeriesRow:
    return {"runId": run.run_id, "dateISO": run.date_iso, "dateLabel": run.date_label,
            "principles": [_principle(p) for p in run.principles]}


def principle_series_payload(series: PrincipleSeries) -> PrincipleSeriesPayload:
    """*series* in the shape the dimension and principle pages read."""
    return {"dimension": series.dimension, "rows": [_row(r) for r in series.runs]}
