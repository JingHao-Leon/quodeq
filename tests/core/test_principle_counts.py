"""Each principle's active-violation counts, counted from findings or carried by the read."""
from __future__ import annotations

from quodeq.core.types import DimensionResult, PrincipleGrade
from quodeq.core.types.finding import Finding, SeverityTally, Totals
from quodeq.core.types.principle_counts import NO_VIOLATIONS, count_by_principle, principles_with_counts
from quodeq.core.types.report import PrincipleCounts
from quodeq.shared.serialization import to_camel_dict


def _v(principle: str | None, severity: str) -> Finding:
    return Finding(practice_id=principle, verdict="violation", severity=severity)


_FINDINGS = [_v("P1", "critical"), _v("P1", "major"), _v("P1", "minor"), _v("P2", "major"), _v(None, "major")]
_GRADES = [PrincipleGrade("P1", "6.0/10", "Fair"), PrincipleGrade("P2", "8.0/10", "Good"),
           PrincipleGrade("P3", "9.0/10", "Good")]


def test_count_by_principle_splits_severities_and_skips_unplaced_findings():
    assert count_by_principle(_FINDINGS) == {
        "P1": PrincipleCounts(violations=3, critical=1, major=1),
        "P2": PrincipleCounts(violations=1, critical=0, major=1),
    }


def test_a_full_read_counts_every_graded_principle():
    dim = DimensionResult(dimension="security", principles=_GRADES, violations=_FINDINGS)
    counts = [p.counts for p in principles_with_counts(dim)]
    assert counts == [PrincipleCounts(3, 1, 1), PrincipleCounts(1, 0, 1), NO_VIOLATIONS]


def test_a_findings_free_read_leaves_the_counts_unknown():
    totals = Totals(violation_count=4, severity=SeverityTally(major=4))
    dim = DimensionResult(dimension="security", principles=_GRADES, totals=totals)
    assert [p.counts for p in principles_with_counts(dim)] == [None, None, None]


def test_counts_the_read_carried_are_kept():
    carried = [PrincipleGrade("P1", "6.0/10", "Fair", counts=PrincipleCounts(7, 2, 3))]
    totals = Totals(violation_count=7)
    dim = DimensionResult(dimension="security", principles=carried, totals=totals)
    assert principles_with_counts(dim) == carried


def test_the_counts_never_reach_a_serialized_grade():
    grade = PrincipleGrade("P1", "6.0/10", "Fair", counts=PrincipleCounts(1, 0, 1))
    assert to_camel_dict(grade) == {"principle": "P1", "score": "6.0/10", "grade": "Fair"}
