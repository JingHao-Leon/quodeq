"""Wire shapes of one dimension's per-principle score series.

Served on demand by ``GET .../dimensions/<dimension>/principle-series`` for
the dimension and principle pages; the trend rows deliberately do not carry
principles (they would triple the Overview payload).
"""
from __future__ import annotations

from typing import TypedDict


class PrincipleDetail(TypedDict):
    """One principle's score, grade and active-violation counts in one run.

    ``score`` is the number the principle grade shows; ``majors`` counts
    criticals and majors, as a dimension's does. The counts are None when the
    run's cached row predates them (unknown, not zero).
    """
    principle: str
    score: float | None
    grade: str | None
    critical: int | None
    majors: int | None
    violations: int | None


class PrincipleSeriesRow(TypedDict):
    """One run that scored the dimension: its identity and its principles."""
    runId: str
    dateISO: str | None
    dateLabel: str
    principles: list[PrincipleDetail]


class PrincipleSeries(TypedDict):
    """The response: the dimension asked for and its rows, newest first like the trend."""
    dimension: str
    rows: list[PrincipleSeriesRow]
