"""The assistant reads the Map's Risk areas, a dimension's principle history and several paths at once."""
import json

from quodeq.assistant.tools import ToolContext, build_registry
from quodeq.data.sqlite.assistant_repository import AssistantRepository
from quodeq.services import map_history
from tests.services._map_history_fixtures import env, violation, write_run  # noqa: F401 -- env is a fixture

CORE = [f"core/m{i}.py" for i in range(4)]
UI = [f"ui/v{i}.py" for i in range(4)]


def _project(env):
    p = env / "proj"
    sec = [violation(f, sev="critical") for f in CORE] + [violation(UI[0], sev="minor")]
    write_run(p, "r1", "2026-09-01", {"security": sec})
    write_run(p, "r2", "2026-09-08", {"security": sec})
    return p


def _ctx(tmp_path, env, read_only=False):
    repo = AssistantRepository(tmp_path / "assistant.db")
    repo.create_session(session_id="s1", provider="ollama")
    return ToolContext(repository=repo, session_id="s1", run_dir=None, repo_root=None,
                       evaluators_dir=tmp_path / "ev", compiled_dir=tmp_path / "compiled",
                       dimensions_file=tmp_path / "dimensions.json", project_id="proj", reports_dir=env,
                       read_only=read_only, visible_standard_ids=None)


def test_risk_areas_worst_first_with_their_zone_and_severities(tmp_path, env):
    _project(env)
    out = build_registry(_ctx(tmp_path, env)).dispatch("get_risk_areas", {})["result"]
    first = out["areas"][0]
    assert first["name"] == "core" and first["zone"] == "fix_first"
    assert first["severities"]["critical"] == 4 and first["files"] == 4
    assert [a["name"] for a in out["areas"]].index("ui") > 0


def test_a_shared_session_never_runs_git_for_activity(tmp_path, env, monkeypatch):
    p = _project(env)
    (p / "repository_info.json").write_text(json.dumps({"path": str(tmp_path)}))
    calls = []
    monkeypatch.setattr(map_history, "git_commits_per_transition", lambda *a: calls.append(a))
    out = build_registry(_ctx(tmp_path, env, read_only=True)).dispatch("get_risk_areas", {})["result"]
    assert calls == [] and out["activitySource"] != "git"


def test_principle_history_lists_each_run(tmp_path, env):
    _project(env)
    out = build_registry(_ctx(tmp_path, env)).dispatch("get_principle_history", {"dimension": "security"})
    assert out["ok"] is True
    assert len(out["result"]["runs"]) == 2


def test_get_violations_takes_an_areas_paths(tmp_path, env):
    _project(env)
    reg = build_registry(_ctx(tmp_path, env))
    both = reg.dispatch("get_violations", {"paths": ["core", "ui/v0.py"]})["result"]
    assert both["count"] == 5 and both["paths"] == ["core", "ui/v0.py"]
