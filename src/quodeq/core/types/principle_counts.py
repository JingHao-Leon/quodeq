"""Each principle's active-violation counts, attached to its grade.

The trend's per-principle series shows a principle's criticals, majors and
violations per run next to its score. A full read (or a rescore) has the
findings and counts them here; a findings-free read must already carry them
(the scalar SQL path, a score-cache row) or leaves them unknown.
"""
from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import replace

from .dimension import DimensionResult
from .finding import Finding
from .report import PrincipleCounts, PrincipleGrade
from .severity import Severity

#: The counts of a principle with no active violation.
NO_VIOLATIONS = PrincipleCounts()


def count_by_principle(violations: Iterable[Finding]) -> dict[str, PrincipleCounts]:
    """``{principle: PrincipleCounts}`` over *violations*, keyed by ``practice_id``.

    Findings without a principle are left out: no principle grade names them.
    """
    totals: Counter[str] = Counter()
    critical: Counter[str] = Counter()
    major: Counter[str] = Counter()
    for f in violations:
        if not f.practice_id:
            continue
        totals[f.practice_id] += 1
        if f.severity == Severity.CRITICAL:
            critical[f.practice_id] += 1
        elif f.severity == Severity.MAJOR:
            major[f.practice_id] += 1
    return {name: PrincipleCounts(total, critical[name], major[name]) for name, total in totals.items()}


def _carries_every_violation(dim: DimensionResult) -> bool:
    """Whether *dim*'s violation list is complete: a full read or a rescore,
    not a findings-free read whose totals count what it dropped."""
    return dim.totals is None or dim.totals.violation_count == len(dim.violations)


def principles_with_counts(dim: DimensionResult) -> list[PrincipleGrade]:
    """*dim*'s principle grades, each carrying its active-violation counts.

    Counts already on a grade are kept. The rest are counted from *dim*'s
    findings when it carries all of them (a graded principle with none counts
    zero); a findings-free read leaves them unknown (None).
    """
    principles = list(dim.principles)
    if all(p.counts is not None for p in principles) or not _carries_every_violation(dim):
        return principles
    counted = count_by_principle(dim.violations)
    return [p if p.counts is not None else replace(p, counts=counted.get(p.principle or "", NO_VIOLATIONS))
            for p in principles]
