"""get_history and compare_runs: trimming, dimension narrowing, visibility, defaults."""
from types import SimpleNamespace

import pytest

from quodeq.assistant.tools import ToolContext, build_registry
from quodeq.data.sqlite.assistant_repository import AssistantRepository

from ._tools_read_helpers import _run_ctx

_TREND = [
    {"runId": "run2", "dateISO": "2026-10-02", "dateLabel": "Oct 2", "status": "done",
     "runNumericAverage": 7.5, "runOverallGrade": "B", "numericAverage": 7.5, "overallGrade": "B",
     "violations": 5, "majors": 2, "critical": 0, "openTypes": 3,
     "dimensionDetails": [
         {"dimension": "security", "score": 7.0, "grade": "B", "delta": 1.0,
          "violations": 3, "majors": 1, "openTypes": 2, "critical": 0},
         {"dimension": "reliability", "score": 8.0, "grade": "A", "delta": None,
          "violations": 2, "majors": 1, "openTypes": 1, "critical": 0}]},
    {"runId": "run1", "dateISO": "2026-10-01", "dateLabel": "Oct 1", "status": "done",
     "runNumericAverage": 6.0, "runOverallGrade": "C", "numericAverage": 6.0, "overallGrade": "C",
     "violations": 4, "majors": 2, "critical": 1, "openTypes": 2,
     "dimensionDetails": [
         {"dimension": "security", "score": 6.0, "grade": "C", "delta": None,
          "violations": 4, "majors": 2, "openTypes": 2, "critical": 1}]},
]


def _project_ctx(tmp_path, visible_standard_ids=None):
    repo = AssistantRepository(tmp_path / "assistant.db")
    repo.create_session(session_id="s1", provider="ollama")
    return ToolContext(
        repository=repo, session_id="s1", run_dir=None, repo_root=None,
        evaluators_dir=tmp_path / "e", compiled_dir=tmp_path / "c", dimensions_file=tmp_path / "d.json",
        project_id="p", reports_dir=tmp_path / "reports", visible_standard_ids=visible_standard_ids)


@pytest.fixture()
def rows_loaded(monkeypatch):
    calls = []

    class FakeRows:
        @classmethod
        def load(cls, root, project):
            calls.append((root, project))
            return SimpleNamespace(trend=lambda: _TREND)

    monkeypatch.setattr("quodeq.assistant.tools._read_tools_history.ProjectRows", FakeRows)
    return calls


def test_get_history_trims_runs_newest_first(tmp_path, rows_loaded):
    res = build_registry(_project_ctx(tmp_path)).dispatch("get_history", {})["result"]
    assert rows_loaded == [(tmp_path / "reports", "p")]
    assert res["count"] == 2 and res["project"] == "p" and res["hiddenStandardIds"] == []
    first = res["runs"][0]
    assert first["runId"] == "run2" and first["score"] == 7.5 and first["accumulatedGrade"] == "B"
    assert first["dimensions"][0] == {"dimension": "security", "score": 7.0, "grade": "B",
                                      "delta": 1.0, "violations": 3, "majors": 1, "critical": 0}
    assert "dateISO" not in first and "openTypes" in first


def test_get_history_for_one_dimension_keeps_only_runs_that_scored_it(tmp_path, rows_loaded):
    res = build_registry(_project_ctx(tmp_path)).dispatch(
        "get_history", {"dimension": "reliability"})["result"]
    assert res["dimension"] == "reliability" and res["count"] == 1
    assert [d["dimension"] for d in res["runs"][0]["dimensions"]] == ["reliability"]


def test_get_history_honours_limit(tmp_path, rows_loaded):
    res = build_registry(_project_ctx(tmp_path)).dispatch("get_history", {"limit": 1})["result"]
    assert [r["runId"] for r in res["runs"]] == ["run2"]


def test_get_history_hides_hidden_standards_and_their_blended_scores(tmp_path, rows_loaded):
    ctx = _project_ctx(tmp_path, visible_standard_ids=("security",))
    res = build_registry(ctx).dispatch("get_history", {})["result"]
    assert res["hiddenStandardIds"] == ["reliability"]
    assert all(d["dimension"] == "security" for r in res["runs"] for d in r["dimensions"])
    assert "score" not in res["runs"][0] and "accumulatedScore" not in res["runs"][0]
    assert "note" in res


def test_get_history_rejects_a_traversal_dimension(tmp_path, rows_loaded):
    out = build_registry(_project_ctx(tmp_path)).dispatch("get_history", {"dimension": "../x"})
    assert out["ok"] is False and "invalid dimension" in out["error"]


def test_get_history_derives_the_project_from_a_run_only_context(tmp_path, rows_loaded):
    build_registry(_run_ctx(tmp_path)).dispatch("get_history", {})
    assert rows_loaded == [(tmp_path.parent, tmp_path.name)]


def test_get_history_without_any_scope_points_at_get_context(tmp_path):
    ctx = _project_ctx(tmp_path)
    ctx = ToolContext(**{**ctx.__dict__, "project_id": None, "reports_dir": None})
    out = build_registry(ctx).dispatch("get_history", {})
    assert out["ok"] is False and "get_context" in out["error"]


def _finding(i, sev="major"):
    return {"principle": "P1", "req": f"R-{i}", "file": f"src/f{i}.py", "line": i,
            "severity": sev, "title": f"t{i}", "reason": "r", "snippet": "big", "context": "big"}


def _diff_payload():
    entry = {
        "counts": {"new": 25, "resolved": 1, "moved": 0, "same": 3, "carried": 3,
                   "notReevaluated": 0, "newSev": {"major": 25}, "resolvedSev": {"minor": 1}},
        "majorsDelta": 25, "criticalDelta": 0,
        "types": {"opened": ["R-1"], "closed": ["R-9"], "perReq": {"R-1": [1, 0]}},
        "new": [_finding(i) for i in range(25)], "resolved": [_finding(99, "minor")], "moved": [],
        "againstRunId": "run1", "againstCommitSha": "abc", "againstCommitDirty": False,
        "sinceBaseline": {"scope": "changed", "changedFiles": ["src/f1.py", "src/f2.py"],
                          "counts": {"new": 2, "resolved": 0}, "majorsDelta": 2, "criticalDelta": 0,
                          "types": {"opened": ["R-1"], "closed": []}, "new": [], "resolved": []},
    }
    counted = dict(entry, new=[], majorsDelta=0, sinceBaseline=dict(entry["sinceBaseline"], changedFiles=3))
    return {"runId": "run2", "commitSha": "def", "commitDirty": False, "againstRunId": None,
            "dimensions": {"security": entry, "reliability": counted}}


@pytest.fixture()
def diffed(monkeypatch):
    calls = []

    def fake_diff(root, project, run_id, against):
        calls.append((root, project, run_id, against))
        if run_id == "missing":
            raise FileNotFoundError(run_id)
        return _diff_payload()

    monkeypatch.setattr("quodeq.assistant.tools._read_tools_history.diff_runs", fake_diff)
    monkeypatch.setattr("quodeq.assistant.tools._read_tools_history.list_runs",
                        lambda root, project, limit: [SimpleNamespace(run_id="newest")])
    return calls


def test_compare_runs_defaults_to_the_newest_run_and_trims_lists(tmp_path, diffed):
    res = build_registry(_project_ctx(tmp_path)).dispatch("compare_runs", {})["result"]
    assert diffed == [(tmp_path / "reports", "p", "newest", None)]
    sec = res["dimensions"]["security"]
    assert len(sec["new"]) == 20 and sec["counts"]["new"] == 25
    assert sec["new"][0] == {"principle": "P1", "file": "src/f0.py", "line": 0, "severity": "major",
                             "title": "t0", "reason": "r", "requirement": "R-0"}
    assert sec["typesOpened"] == ["R-1"] and sec["typesClosed"] == ["R-9"]
    assert sec["sinceBaseline"] == {"scope": "changed", "changedFiles": 2, "counts": {"new": 2, "resolved": 0},
                                    "majorsDelta": 2, "criticalDelta": 0, "typesOpened": ["R-1"],
                                    "typesClosed": []}
    assert "perReq" not in str(sec) and "againstCommitSha" not in sec
    # The service reports the changed files as a count on some payloads.
    assert res["dimensions"]["reliability"]["sinceBaseline"]["changedFiles"] == 3


def test_compare_runs_uses_the_selected_run_and_the_given_baseline(tmp_path, diffed):
    build_registry(_run_ctx(tmp_path)).dispatch("compare_runs", {"against": "run1"})
    assert diffed[-1] == (tmp_path.parent, tmp_path.name, "run", "run1")


def test_compare_runs_hides_hidden_standards(tmp_path, diffed):
    ctx = _project_ctx(tmp_path, visible_standard_ids=("security",))
    res = build_registry(ctx).dispatch("compare_runs", {})["result"]
    assert list(res["dimensions"]) == ["security"] and res["hiddenStandardIds"] == ["reliability"]


@pytest.mark.parametrize("args,fragment", [
    ({"run_id": "../x"}, "invalid run_id"),
    ({"against": "a/b"}, "invalid against"),
    ({"run_id": "missing"}, "run not found"),
])
def test_compare_runs_errors_are_tool_errors(tmp_path, diffed, args, fragment):
    out = build_registry(_project_ctx(tmp_path)).dispatch("compare_runs", args)
    assert out["ok"] is False and fragment in out["error"]
