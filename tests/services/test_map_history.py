import json
import os
import subprocess
from pathlib import Path

import pytest

from quodeq.services import map_history
from quodeq.services.map_history import build_map_history

DIMS = ("security", "maintainability")


def _run(project_dir: Path, run_id: str, day: str, violations: dict[str, list[dict]], dims=DIMS, state="done") -> None:
    run = project_dir / run_id
    (run / "evaluation").mkdir(parents=True, exist_ok=True)
    for dim in dims:
        (run / "evaluation" / f"{dim}.json").write_text(json.dumps({
            "dimension": dim, "date": f"{day}T10:00:00+00:00", "principles": [],
            "violations": violations.get(dim, []), "compliance": []}))
    (run / "status.json").write_text(json.dumps({"state": state, "started_at": f"{day}T10:00:00Z"}))


@pytest.fixture
def env(tmp_path, monkeypatch):
    evals = tmp_path / "evaluations"
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    return evals


V = lambda f, sev="major", req="R1", snip="x()": {"req": req, "file": f, "line": 1, "snippet": snip, "severity": sev}


def test_estimated_history_with_a_new_dimension_midway(env):
    p = env / "proj"
    stable = [V(f"feature-b/src/S{i}.kt", snip=f"s{i}()") for i in range(5)]
    _run(p, "r1", "2026-09-01", {"security": [V("feature-a/src/A.kt"), *stable]}, dims=("security",))
    _run(p, "r2", "2026-09-08", {"security": [V("feature-a/src/A.kt", snip="changed()"), *stable]})
    _run(p, "r3", "2026-09-15", {"security": [V("feature-a/src/A.kt", snip="changed()"), *stable]})
    out = build_map_history(env, "proj", frames="all")
    assert out["activitySource"] == "estimated"
    assert out["days"] == ["2026-09-01", "2026-09-08", "2026-09-15"]
    a = out["fileNames"].index("feature-a/src/A.kt")
    assert out["fileArea"][a] == "a"
    assert [next(r for r in f["files"] if r[0] == a)[7] for f in out["frames"]] == [0, 1, 0]


def test_latest_only_by_default_and_cached_second_time(env, monkeypatch):
    p = env / "proj"
    _run(p, "r1", "2026-09-01", {"security": [V("x/a.py")]})
    _run(p, "r2", "2026-09-08", {"security": [V("x/a.py")]})
    first = build_map_history(env, "proj")
    assert len(first["frames"]) == 1 and first["frames"][0]["day"] == "2026-09-08"
    calls = []
    real = map_history.build_run_snapshot
    monkeypatch.setattr(map_history, "build_run_snapshot", lambda *a: calls.append(1) or real(*a))
    assert build_map_history(env, "proj") == first
    assert calls == []


def test_unreadable_reports_are_skipped(env):
    p = env / "proj"
    _run(p, "r1", "2026-09-01", {"security": [V("x/a.py")]})
    (p / "r1" / "evaluation" / "maintainability.json").write_text("{not json")
    _run(p, "r2", "2026-09-08", {"security": [V("x/a.py")]})
    assert build_map_history(env, "proj")["frames"][0]["day"] == "2026-09-08"


def test_git_activity_when_the_project_is_a_repo(env, tmp_path):
    repo = tmp_path / "repo"; repo.mkdir()
    gitenv = {**__import__("os").environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t",
              "GIT_AUTHOR_DATE": "2026-09-05T10:00:00", "GIT_COMMITTER_DATE": "2026-09-05T10:00:00"}
    subprocess.run(["git", "-C", str(repo), "init", "-q"], check=True)
    (repo / "a.py").write_text("1")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "c"], check=True, env=gitenv)
    p = env / "proj"
    _run(p, "r1", "2026-09-01", {"security": [V("a.py")]})
    _run(p, "r2", "2026-09-08", {"security": [V("a.py")]})
    (p / "repository_info.json").write_text(json.dumps({"path": str(repo)}))
    out = build_map_history(env, "proj")
    assert out["activitySource"] == "git"
    idx = out["fileNames"].index("a.py")
    assert next(r for r in out["frames"][0]["files"] if r[0] == idx)[6] == 1


def test_unknown_project_is_empty(env):
    assert build_map_history(env, "nope") == {"activitySource": "none", "days": [], "fileNames": [], "fileArea": [], "fileTest": [], "frames": []}


def _cached_run_ids():
    from quodeq.services.wiring import open_score_cache
    with open_score_cache() as conn:
        return {r[0] for r in conn.execute("SELECT run_id FROM map_snapshot").fetchall()}


def test_unfinished_runs_are_not_cached_and_new_dimensions_show_up(env):
    p = env / "proj"
    _run(p, "r1", "2026-09-01", {"security": [V("x/a.py")]})
    _run(p, "r2", "2026-09-08", {"security": [V("x/a.py")]}, dims=("security",), state="running")
    (p / "r2" / ".pid").write_text(str(os.getpid()))  # a live process keeps the run RUNNING
    out = build_map_history(env, "proj")
    assert out["days"] == ["2026-09-01", "2026-09-08"]
    assert _cached_run_ids() == {"r1"}
    (p / "r2" / ".pid").unlink()
    _run(p, "r2", "2026-09-08", {"security": [V("x/a.py")], "maintainability": [V("x/b.py", snip="b()")]})
    out = build_map_history(env, "proj")
    assert "x/b.py" in out["fileNames"]
    assert _cached_run_ids() == {"r1", "r2"}


def test_run_without_a_usable_day_is_skipped(env):
    p = env / "proj"
    _run(p, "r1", "2026-09-01", {"security": [V("x/a.py")]})
    _run(p, "r2", "", {"security": [V("x/a.py")]})
    assert build_map_history(env, "proj")["days"] == ["2026-09-01"]


def test_corrupt_cached_payload_is_rebuilt(env):
    p = env / "proj"
    _run(p, "r1", "2026-09-01", {"security": [V("x/a.py")]})
    first = build_map_history(env, "proj")
    from quodeq.services.wiring import open_score_cache
    with open_score_cache() as conn:
        conn.execute("UPDATE map_snapshot SET payload = ?", ('{"nope": 1}',))
        conn.commit()
    assert build_map_history(env, "proj") == first


def test_history_is_not_capped_at_the_default_run_limit(env, monkeypatch):
    seen = {}
    real = map_history.ProjectRows.load

    def spy(root, project, *a, **kw):
        seen.update(kw)
        return real(root, project, *a, **kw)
    monkeypatch.setattr(map_history.ProjectRows, "load", spy)
    _run(env / "proj", "r1", "2026-09-01", {"security": [V("x/a.py")]})
    build_map_history(env, "proj")
    assert seen == {"run_limit": 0}
