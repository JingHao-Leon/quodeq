"""The trend keeps a failure_streak dimension out of the overall averages, the
same rule the run score and the accumulated summary apply, and marks that
dimension's detail as provisional so the UI's own fold can skip it too."""
from __future__ import annotations

from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.core.types import DimensionResult
from quodeq.services.accumulated import numeric_average
from quodeq.services.dashboard_trend import build_accumulated_trend
from tests.services._dashboard_fixtures import _make_run


def _dim(name: str, score: str, exit_reason: str | None = None) -> DimensionResult:
    return DimensionResult(dimension=name, overall_grade="Good", overall_score=f"{score}/10", exit_reason=exit_reason)


def test_trend_averages_leave_out_a_failure_streak_dimension():
    dims = [_dim("security", "6.0"), _dim("flexibility", "9.0", exit_reason="failure_streak")]
    [entry] = build_accumulated_trend([_make_run("r1")], lambda _rid: dims, params=DEFAULT_PARAMS)
    assert entry["numericAverage"] == 6.0
    assert entry["runNumericAverage"] == 6.0
    by_dim = {d["dimension"]: d for d in entry["dimensionDetails"]}
    assert by_dim["flexibility"]["provisional"] is True
    assert "provisional" not in by_dim["security"]  # the usual payload is unchanged


def test_trend_averages_keep_a_time_limit_dimension():
    dims = [_dim("security", "6.0"), _dim("usability", "8.0", exit_reason="time_limit")]
    [entry] = build_accumulated_trend([_make_run("r1")], lambda _rid: dims, params=DEFAULT_PARAMS)
    assert entry["numericAverage"] == 7.0


def test_numeric_average_is_none_when_every_dimension_is_provisional():
    assert numeric_average([_dim("flexibility", "9.0", exit_reason="failure_streak")], DEFAULT_PARAMS) is None
