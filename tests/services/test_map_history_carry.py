"""Every frame is the accumulated view: a dimension a run did not report is carried from the latest earlier run."""
import json

import pytest

from quodeq.services import map_history
from quodeq.services.map_history import build_map_history
from quodeq.services.scoring import ProjectRows
from tests.services._map_history_fixtures import write_run, violation, env  # noqa: F401 -- env is a pytest fixture

THREE = ("security", "maintainability", "reliability")


def _findings(dim: str, *ns: int) -> list[dict]:
    return [violation(f"x/{dim}{n}.py", req=f"R{n}", snip=f"{dim}{n}()") for n in ns]


def _drop_out(env) -> None:
    """r2 skips reliability and changes security; r3 reports reliability again with two more and repeats one."""
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {d: _findings(d, 0, 1, 2) for d in THREE}, dims=THREE)
    write_run(p, "r2", "2026-09-02", {"security": _findings("security", 1, 2, 3, 4),
                                 "maintainability": _findings("maintainability", 0, 1, 2)}, dims=THREE[:2])
    write_run(p, "r3", "2026-09-03", {"security": _findings("security", 1, 1, 2, 3, 4),
                                 "maintainability": _findings("maintainability", 0, 1, 2),
                                 "reliability": _findings("reliability", 0, 1, 2, 3, 4)}, dims=THREE)


def _issues(frame) -> int:
    return sum(r.violations for r in frame.files)


def test_a_run_missing_a_dimension_shows_that_dimensions_findings_from_the_run_before(env):
    _drop_out(env)
    out = build_map_history(env, "proj", frames="all")
    names = {out.file_names[r.file] for r in out.frames[1].files}
    assert {"x/reliability0.py", "x/reliability2.py"} <= names
    assert [_issues(f) for f in out.frames] == [9, 10, 13]


def _graded(env, run_id: str, dims: tuple[str, ...]) -> None:
    """Give *run_id*'s reports a score, so the dashboard's accumulated walk takes them."""
    for dim in dims:
        report = env / "proj" / run_id / "evaluation" / f"{dim}.json"
        data = json.loads(report.read_text())
        principle = {"name": "P1", "score": "7.0/10", "grade": "Good"}
        data.update(overallScore="7.0/10", overallGrade="Good", filesRead=10, principles=[principle],
                    violations=[{**v, "principle": "P1"} for v in data["violations"]])
        report.write_text(json.dumps(data))


def test_the_latest_frame_counts_what_the_dashboard_header_counts_when_the_latest_run_lacks_a_dimension(env):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {d: _findings(d, 0, 1, 2) for d in THREE}, dims=THREE)
    write_run(p, "r2", "2026-09-02", {"security": _findings("security", 0),
                                 "maintainability": _findings("maintainability", 5)}, dims=THREE[:2])
    _graded(env, "r1", THREE)
    _graded(env, "r2", THREE[:2])
    header = ProjectRows.load(env, "proj").accumulated()["summary"]["totalViolations"]
    assert _issues(build_map_history(env, "proj").frames[-1]) == header == 5


def test_a_later_partial_run_of_the_day_keeps_what_the_days_earlier_runs_reported(env):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {d: _findings(d, 0, 1, 2) for d in THREE}, dims=THREE, at="05:00:00")
    write_run(p, "r2", "2026-09-01", {"security": _findings("security", 0)}, dims=("security",), at="09:00:00")
    write_run(p, "r3", "2026-09-02", {"security": _findings("security", 0, 1)}, dims=("security",))
    for run_id, dims in (("r1", THREE), ("r2", THREE[:1]), ("r3", THREE[:1])):
        _graded(env, run_id, dims)
    header = ProjectRows.load(env, "proj").accumulated()["summary"]["totalViolations"]
    out = build_map_history(env, "proj", frames="all")
    assert [_issues(f) for f in out.frames] == [7, 8]
    assert _issues(out.frames[-1]) == header


def test_a_day_with_only_a_partial_run_gets_its_own_frame(env):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {d: _findings(d, 0, 1, 2) for d in THREE}, dims=THREE)
    write_run(p, "r2", "2026-09-02", {"reliability": _findings("reliability", 0)}, dims=("reliability",))
    out = build_map_history(env, "proj", frames="all")
    assert out.days == ("2026-09-01", "2026-09-02")
    assert [_issues(f) for f in out.frames] == [9, 7]


def test_a_report_the_header_does_not_count_keeps_the_dimension_as_last_counted(env):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {d: _findings(d, 0, 1, 2) for d in THREE}, dims=THREE)
    write_run(p, "r2", "2026-09-02", {"security": _findings("security", 0)}, dims=("security",))
    stub = p / "r2" / "evaluation" / "security.json"
    stub.write_text(json.dumps({**json.loads(stub.read_text()), "filesRead": 0}))
    out = build_map_history(env, "proj", frames="all")
    assert [_issues(f) for f in out.frames] == [9]


def test_the_readout_delta_matches_new_less_fixed_across_a_dimension_drop_out(env):
    _drop_out(env)
    frames = build_map_history(env, "proj", frames="all").frames
    deltas = [_issues(b) - _issues(a) for a, b in zip(frames, frames[1:])]
    assert deltas == [f.new - f.fixed for f in frames[1:]] == [1, 3]


@pytest.mark.parametrize("old_shape", ["2", "3", "4"])
def test_runs_cached_under_an_older_shape_are_rebuilt_carried(env, monkeypatch, old_shape):
    shape = map_history.SNAPSHOT_SHAPE
    monkeypatch.setattr(map_history, "SNAPSHOT_SHAPE", old_shape)
    _drop_out(env)
    build_map_history(env, "proj", frames="all")
    monkeypatch.setattr(map_history, "SNAPSHOT_SHAPE", shape)
    calls = []
    real = map_history.build_raw_run
    monkeypatch.setattr(map_history, "build_raw_run", lambda *a, **kw: calls.append(1) or real(*a, **kw))
    out = build_map_history(env, "proj", frames="all")
    assert len(calls) == 3 and [_issues(f) for f in out.frames] == [9, 10, 13]
