"""Parsed dimension-report shapes: per-principle grades and the whole report."""
from __future__ import annotations

from dataclasses import dataclass, field

from .finding import Finding, Totals
from .wire_fields import WIRE_HIDDEN


@dataclass(frozen=True, slots=True)
class PrincipleCounts:
    """One principle's active violations in a run: all of them, the criticals, and the majors.

    ``major`` counts the major severity alone; a view that groups criticals
    with majors adds the two.
    """

    violations: int = 0
    critical: int = 0
    major: int = 0


@dataclass(frozen=True, slots=True)
class PrincipleGrade:
    """Grade result for a single principle within a dimension report."""

    principle: str | None = None
    score: str | None = None
    grade: str | None = None
    # The evidence confidence level ("low", "medium", "high"); low marks thin evidence.
    confidence: str | None = None
    # The principle's active violations, when the read counted them; None when
    # it could not (a score-cache row written before the counts were stored).
    # Carried for the trend's per-principle series, never serialized with the grade.
    counts: PrincipleCounts | None = field(default=None, metadata=WIRE_HIDDEN)


@dataclass(frozen=True, slots=True)
class PrincipleGradeWithOverall:
    """PrincipleGrade extended with an ``is_overall`` flag for aggregate rows.

    Attributes:
        principle: Principle name or None for unnamed entries.
        score: Numeric score as a string, e.g. ``"8.5"``.
        grade: Letter grade, e.g. ``"A"``, ``"B+"``.
        is_overall: True when this row represents the aggregate score.
    """

    principle: str | None = None
    score: str | None = None
    grade: str | None = None
    is_overall: bool = False


@dataclass(frozen=True, slots=True)
class ParsedReport:
    """Fully parsed dimension report with grades, findings, and totals.

    Attributes:
        dimension: The quality dimension this report covers (e.g. ``"security"``).
        overall_score: Aggregate numeric score as a string.
        overall_grade: Aggregate letter grade.
        principles: Per-principle grade breakdown.
        detail_principles: Raw principle detail dicts from the source report.
        violations: List of violation findings.
        compliance: List of compliance findings.
        totals: Aggregated violation/compliance counts and severity tally.
    """

    dimension: str | None = None
    overall_score: str | None = None
    overall_grade: str | None = None
    principles: list[PrincipleGrade] = field(default_factory=list)
    detail_principles: list[dict[str, object]] = field(default_factory=list)
    violations: list[Finding] = field(default_factory=list)
    compliance: list[Finding] = field(default_factory=list)
    totals: Totals | None = None
