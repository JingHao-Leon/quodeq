"""One dimension's per-principle score series, as the use case returns it.

Served on demand by ``GET .../dimensions/<dimension>/principle-series`` for
the dimension and principle pages (the trend rows carry no principles: they
would triple the Overview payload). The wire shape is the API layer's
(``api/principle_series_payload.py``).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .report import PrincipleGrade


@dataclass(frozen=True, slots=True)
class PrincipleSeriesRun:
    """One run that scored the dimension: its identity and its graded principles.

    Each principle carries its violation counts (``PrincipleGrade.counts``),
    None where the run's cached row could not know them.
    """

    run_id: str
    date_iso: str | None
    date_label: str
    principles: list[PrincipleGrade] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class PrincipleSeries:
    """The dimension asked for and its runs, newest first like the trend."""

    dimension: str
    runs: list[PrincipleSeriesRun] = field(default_factory=list)
