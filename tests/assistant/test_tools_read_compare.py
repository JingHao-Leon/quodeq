"""compare_projects: defaults, trimming, unknown ids, visibility."""
import pytest

from quodeq.assistant.tools import ToolContext, build_registry
from quodeq.data.sqlite.assistant_repository import AssistantRepository


def _ctx(tmp_path, visible_standard_ids=None):
    repo = AssistantRepository(tmp_path / "assistant.db")
    repo.create_session(session_id="s1", provider="ollama")
    return ToolContext(
        repository=repo, session_id="s1", run_dir=None, repo_root=None,
        evaluators_dir=tmp_path / "e", compiled_dir=tmp_path / "c", dimensions_file=tmp_path / "d.json",
        project_id="p", reports_dir=tmp_path / "reports", visible_standard_ids=visible_standard_ids)


def _summary(name):
    return {
        "project": name,
        "summary": {"overallGrade": "B", "numericAverage": 7.1, "totalViolations": 9,
                    "dimensionCount": 2, "severity": {"critical": 0, "major": 4, "minor": 5}},
        "dimensions": [
            {"dimension": "security", "overallScore": 7.0, "overallGrade": "B", "totals": {"violations": 5},
             "principles": [{"principle": "S1"}]},
            {"dimension": "reliability", "overallScore": 7.2, "overallGrade": "B", "totals": {"violations": 4}},
        ],
        "trend": [{"runId": "r1", "dateISO": "2026-10-01"}],
        "runsCount": 3, "lastRun": {"runId": "r1", "dateLabel": "Oct 1", "status": "done"},
        "commitsSinceLastRun": 4, "scoring": {"customFormula": False},
    }


@pytest.fixture()
def fleet(monkeypatch):
    calls = []

    def fake_fleet(root, names):
        calls.append((root, list(names)))
        return {"summaries": [_summary(n) for n in names if n != "zzz"], "errors": {}}

    monkeypatch.setattr("quodeq.assistant.tools._read_tools_compare.build_fleet_compare", fake_fleet)
    monkeypatch.setattr("quodeq.assistant.tools._read_tools_compare.collect_candidate_dirs",
                        lambda root, max_listed: ["p", "q"])
    return calls


def test_compare_projects_defaults_to_the_current_project(tmp_path, fleet):
    res = build_registry(_ctx(tmp_path)).dispatch("compare_projects", {})["result"]
    assert fleet == [(tmp_path / "reports", ["p"])]
    (row,) = res["projects"]
    assert row["project"] == "p" and row["score"] == 7.1 and row["grade"] == "B"
    assert row["violations"] == 9 and row["severity"]["major"] == 4
    assert row["dimensions"] == [{"dimension": "security", "score": 7.0, "grade": "B"},
                                 {"dimension": "reliability", "score": 7.2, "grade": "B"}]
    assert row["runsCount"] == 3 and row["commitsSinceLastRun"] == 4 and row["lastRun"]["runId"] == "r1"
    assert "trend" not in row and "principles" not in str(row)
    assert res["errors"] == {} and "availableProjects" not in res


def test_compare_projects_dedupes_and_reports_unknown_ids(tmp_path, fleet):
    res = build_registry(_ctx(tmp_path)).dispatch(
        "compare_projects", {"projects": ["p", "q", "p", "zzz"]})["result"]
    assert fleet[-1][1] == ["p", "q", "zzz"]
    assert [r["project"] for r in res["projects"]] == ["p", "q"]
    assert res["errors"] == {"zzz": "unknown project"}
    assert res["availableProjects"] == ["p", "q"]


def test_compare_projects_hides_hidden_standards_and_blended_totals(tmp_path, fleet):
    res = build_registry(_ctx(tmp_path, ("security",))).dispatch("compare_projects", {})["result"]
    (row,) = res["projects"]
    assert [d["dimension"] for d in row["dimensions"]] == ["security"]
    assert "score" not in row and "violations" not in row
    assert res["hiddenStandardIds"] == ["reliability"] and "note" in res


@pytest.mark.parametrize("projects,fragment", [
    (["../x"], "invalid project id"),
    ([f"p{i}" for i in range(11)], "at most 10"),
])
def test_compare_projects_rejects_bad_input(tmp_path, fleet, projects, fragment):
    out = build_registry(_ctx(tmp_path)).dispatch("compare_projects", {"projects": projects})
    assert out["ok"] is False and fragment in out["error"]
