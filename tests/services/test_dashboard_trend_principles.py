"""Each trend row's dimension details carry the run's principle scores, grades and counts."""
from __future__ import annotations

from quodeq.core.observability import NULL_LOG
from quodeq.core.types import DimensionResult, PrincipleGrade
from quodeq.core.types.finding import Finding, SeverityTally, Totals
from quodeq.core.types.report import PrincipleCounts
from quodeq.services.dashboard_trend import build_accumulated_trend
from quodeq.services.score_cache import make_cache_backed_fetcher
from tests.services._dashboard_fixtures import _make_run

_SEC, _REL = "security", "reliability"


def _v(principle: str, severity: str, i: int) -> Finding:
    return Finding(practice_id=principle, verdict="violation", severity=severity, file=f"f{i}.py", line=i,
                   req=f"{principle}-{i}")


def _security(score: str, p1: str, violations: list[Finding]) -> DimensionResult:
    principles = [PrincipleGrade("P1", p1, "Fair"), PrincipleGrade("P2", "9.0/10", "Exemplary")]
    return DimensionResult(dimension=_SEC, overall_score=score, overall_grade="Good",
                           principles=principles, violations=violations)


def _reliability() -> DimensionResult:
    return DimensionResult(dimension=_REL, overall_score="8.0/10", overall_grade="Good",
                           principles=[PrincipleGrade("R1", "8.0/10", "Good")])


_RUNS = [_make_run("r2", "2026-10-02"), _make_run("r1", "2026-10-01")]  # newest first
_DIMS = {
    "r1": [_security("6.0/10", "5.0/10", [_v("P1", "critical", 0), _v("P1", "major", 1), _v("P1", "minor", 2)]),
           _reliability()],
    "r2": [_security("7.0/10", "6.5/10", [_v("P1", "major", 0)])],
}


def _principles(row: dict, dimension: str) -> list[dict]:
    return next(d for d in row["dimensionDetails"] if d["dimension"] == dimension)["principles"]


def test_each_row_carries_its_runs_principle_series_point():
    newest, oldest = build_accumulated_trend(_RUNS, lambda rid: _DIMS[rid])
    assert _principles(oldest, _SEC) == [
        {"principle": "P1", "score": 5.0, "grade": "Fair", "critical": 1, "majors": 2, "violations": 3},
        {"principle": "P2", "score": 9.0, "grade": "Exemplary", "critical": 0, "majors": 0, "violations": 0},
    ]
    assert _principles(newest, _SEC)[0] == {
        "principle": "P1", "score": 6.5, "grade": "Fair", "critical": 0, "majors": 1, "violations": 1,
    }


def test_a_dimension_the_run_skipped_keeps_its_principles_on_the_run_that_scored_it():
    """Carry-over: the newer row has no detail for the skipped dimension (the
    client's bucket rule reaches back to the run that scored it), while the
    accumulated state still counts it."""
    newest, oldest = build_accumulated_trend(_RUNS, lambda rid: _DIMS[rid])
    assert [d["dimension"] for d in newest["dimensionDetails"]] == [_SEC]
    assert newest["accumulatedDimensionsCount"] == 2
    assert _principles(oldest, _REL) == [
        {"principle": "R1", "score": 8.0, "grade": "Good", "critical": 0, "majors": 0, "violations": 0},
    ]


def test_counts_a_read_could_not_know_stay_unknown():
    """A cached row written before the principle counts were stored: score and grade, no counts."""
    dim = DimensionResult(dimension=_SEC, overall_score="7.0/10", overall_grade="Good",
                          totals=Totals(violation_count=2, severity=SeverityTally(major=2)),
                          principles=[PrincipleGrade("P1", "6.0/10", "Fair")])
    (row,) = build_accumulated_trend(_RUNS[:1], lambda rid: [dim])
    assert _principles(row, _SEC) == [
        {"principle": "P1", "score": 6.0, "grade": "Fair", "critical": None, "majors": None, "violations": None},
    ]


def test_the_trend_reads_the_cached_rows_not_the_history_shape(tmp_path, monkeypatch):
    """The cache-backed fetcher's call shape drops principles; the trend must read its rows."""
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "sc.db"))
    fetch = make_cache_backed_fetcher("proj", lambda _rid: "v1", lambda rid: _DIMS[rid], log=NULL_LOG)
    assert all(d.principles == [] for d in fetch("r1"))
    _newest, oldest = build_accumulated_trend(_RUNS, fetch)
    assert [p["violations"] for p in _principles(oldest, _SEC)] == [3, 0]


def test_a_cache_hit_serves_the_counts_written_on_the_miss(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "sc.db"))
    make_cache_backed_fetcher("proj", lambda _rid: "v1", lambda rid: _DIMS[rid], log=NULL_LOG).rows("r1")

    def never(_rid: str) -> list[DimensionResult]:
        raise AssertionError("a hit must not read the run")

    warm = make_cache_backed_fetcher("proj", lambda _rid: "v1", never, log=NULL_LOG)
    (row,) = build_accumulated_trend(_RUNS[1:], warm)
    assert [(p["principle"], p["majors"]) for p in _principles(row, _SEC)] == [("P1", 2), ("P2", 0)]
    assert [p.counts for p in warm.rows("r1")[1].principles] == [
        PrincipleCounts(3, 1, 1), PrincipleCounts(0, 0, 0)]
