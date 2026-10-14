"""One dimension's per-principle series: a row per history run that scored it, newest first."""
from __future__ import annotations

import pytest

from quodeq.api.principle_series_payload import principle_series_payload
from quodeq.core.observability import NULL_LOG
from quodeq.core.run.state import RunState
from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.core.types import DimensionResult, PrincipleGrade
from quodeq.core.types.finding import Finding, SeverityTally, Totals
from quodeq.data.fs.report_parser import RunInfo
from quodeq.services import principle_series
from quodeq.services.principle_series import UnknownDimension
from quodeq.services.principle_series import build_principle_series as _build
from quodeq.services.score_cache import make_cache_backed_fetcher
from quodeq.services.scoring import ProjectRows
from quodeq.services.suppression_keys import SuppressionKeys

_SEC, _REL = "security", "reliability"
_PROJECT = "proj"


def _v(principle: str, severity: str, i: int) -> Finding:
    return Finding(practice_id=principle, verdict="violation", severity=severity, file=f"f{i}.py", line=i,
                   req=f"{principle}-{i}")


def _security(p1: str, violations: list[Finding]) -> DimensionResult:
    principles = [PrincipleGrade("P1", p1, "Fair"), PrincipleGrade("P2", "9.0/10", "Exemplary")]
    return DimensionResult(dimension=_SEC, overall_score="7.0/10", overall_grade="Good",
                           principles=principles, violations=violations)


def _reliability() -> DimensionResult:
    return DimensionResult(dimension=_REL, overall_score="8.0/10", overall_grade="Good",
                           principles=[PrincipleGrade("R1", "8.0/10", "Good")])


def _run(run_id: str, day: str, status: RunState = RunState.DONE) -> RunInfo:
    return RunInfo(run_id=run_id, date_iso=f"2026-10-{day}T10:00:00Z", date_label=f"{day} Oct", status=status)


# Newest first: a running run, a run that skipped security, a failed run, and two that scored it.
_RUNS = [_run("live", "05", RunState.RUNNING), _run("r3", "04"), _run("bad", "03", RunState.FAILED),
         _run("r2", "02"), _run("r1", "01")]
_DIMS = {
    "live": [_security("1.0/10", [])],
    "r3": [_reliability()],
    "bad": [_security("1.0/10", [])],
    "r2": [_security("6.5/10", [_v("P1", "major", 0)])],
    "r1": [_security("5.0/10", [_v("P1", "critical", 0), _v("P1", "major", 1), _v("P1", "minor", 2)]),
           _reliability()],
}


def build_principle_series(root, project: str, dimension: str) -> dict:
    """The series as the route serves it."""
    return principle_series_payload(_build(root, project, dimension))


@pytest.fixture()
def project(tmp_path, monkeypatch):
    """A project directory whose rows come from *fetcher* (the score-cache row fetcher by default)."""
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "sc.db"))
    (tmp_path / _PROJECT).mkdir()

    def use(fetcher) -> None:
        rows = ProjectRows(tmp_path, _PROJECT, DEFAULT_PARAMS, SuppressionKeys(frozenset(), frozenset()),
                           _RUNS, fetcher)
        monkeypatch.setattr(principle_series.ProjectRows, "load", lambda *_a, **_k: rows)

    use(make_cache_backed_fetcher(_PROJECT, lambda _rid: "v1", lambda rid: _DIMS[rid], log=NULL_LOG))
    return tmp_path, use


def test_one_row_per_terminal_run_that_scored_the_dimension_newest_first(project):
    root, _use = project
    payload = build_principle_series(root, _PROJECT, _SEC)
    assert payload["dimension"] == _SEC
    assert [r["runId"] for r in payload["rows"]] == ["r2", "r1"]
    assert payload["rows"][1] == {
        "runId": "r1", "dateISO": "2026-10-01T10:00:00Z", "dateLabel": "01 Oct",
        "principles": [
            {"principle": "P1", "score": 5.0, "grade": "Fair", "critical": 1, "majors": 2, "violations": 3},
            {"principle": "P2", "score": 9.0, "grade": "Exemplary", "critical": 0, "majors": 0, "violations": 0},
        ],
    }


def test_a_run_that_skipped_the_dimension_has_no_row_for_it(project):
    """Carry-over is the client's bucket rule: r3 never scored security, so only reliability lists it."""
    root, _use = project
    assert [r["runId"] for r in build_principle_series(root, _PROJECT, _REL)["rows"]] == ["r3", "r1"]


def test_a_hit_serves_the_counts_the_miss_cached(project):
    root, use = project
    build_principle_series(root, _PROJECT, _SEC)  # the miss persists the rows

    def never(_rid: str) -> list[DimensionResult]:
        raise AssertionError("a hit must not read the run")

    use(make_cache_backed_fetcher(_PROJECT, lambda _rid: "v1", never, log=NULL_LOG))
    assert build_principle_series(root, _PROJECT, _SEC)["rows"][1]["principles"][0]["majors"] == 2


def test_counts_an_older_cached_row_could_not_know_stay_none(project):
    root, use = project
    legacy = DimensionResult(dimension=_SEC, overall_score="7.0/10", principles=[PrincipleGrade("P1", "6.0/10", "Fair")],
                             totals=Totals(violation_count=2, severity=SeverityTally(major=2)))
    use(lambda _rid: [legacy])
    (point,) = build_principle_series(root, _PROJECT, _SEC)["rows"][0]["principles"]
    assert (point["score"], point["critical"], point["majors"], point["violations"]) == (6.0, None, None, None)


def test_a_dimension_no_run_scored_is_unknown(project):
    root, _use = project
    with pytest.raises(UnknownDimension) as exc:
        _build(root, _PROJECT, "usability")
    assert "usability" in exc.value.public_message


def test_a_missing_project_is_not_found(tmp_path):
    with pytest.raises(FileNotFoundError):
        _build(tmp_path, "nope", _SEC)
