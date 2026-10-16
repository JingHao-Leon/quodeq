"""The assistant reads what this release added: the formula in effect and each standard's sync state."""
import dataclasses
import json

from quodeq.assistant.tools import ToolContext, build_registry
from quodeq.core.scoring.params import DEFAULT_PARAMS, params_to_dict
from quodeq.data.sqlite.assistant_repository import AssistantRepository
from quodeq.services import grade_formula


def _ctx(tmp_path):
    evaluators = tmp_path / "evaluators"
    evaluators.mkdir()
    (evaluators / "android.json").write_text(json.dumps({"id": "android", "name": "Android", "principles": []}))
    repo = AssistantRepository(tmp_path / "assistant.db")
    repo.create_session(session_id="s1", provider="ollama")
    return ToolContext(repository=repo, session_id="s1", run_dir=None, repo_root=None,
                       evaluators_dir=evaluators, compiled_dir=tmp_path / "compiled",
                       dimensions_file=tmp_path / "dimensions.json", visible_standard_ids=None)


def test_get_grade_formula_reports_defaults_then_a_custom_formula(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_GRADE_FORMULA_PATH", str(tmp_path / "grade_formula.json"))
    reg = build_registry(_ctx(tmp_path))
    out = reg.dispatch("get_grade_formula", {})["result"]
    assert out["isCustom"] is False and out["current"] == out["defaults"] == params_to_dict(DEFAULT_PARAMS)
    grade_formula.save_params(dataclasses.replace(DEFAULT_PARAMS, base_k=0.3))
    out = reg.dispatch("get_grade_formula", {})["result"]
    assert out["isCustom"] is True and out["current"]["baseK"] == 0.3


def test_list_standards_carries_the_sync_state_and_remote_only_rows(tmp_path, monkeypatch):
    remote = {"android": {"id": "android", "name": "Android v2", "principles": [], "publishedAt": "2026-10-01T00:00:00Z"},
              "go": {"id": "go", "name": "Go", "principles": [], "publishedAt": "2026-10-02T00:00:00Z"}}
    monkeypatch.setattr("quodeq.assistant.tools._read_tools.shared_standards_provider", lambda: lambda: remote)
    rows = {s["id"]: s for s in build_registry(_ctx(tmp_path)).dispatch("list_standards", {})["result"]["standards"]}
    assert rows["android"]["sync_state"] is not None
    assert rows["go"]["remote"] is True and rows["go"]["sync_state"] == "remote_only"
