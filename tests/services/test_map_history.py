import json
import subprocess
from pathlib import Path

import pytest

from quodeq.services.map_history import build_map_history

DIMS = ("security", "maintainability")


def _run(project_dir: Path, run_id: str, day: str, violations: dict[str, list[dict]], dims=DIMS) -> None:
    run = project_dir / run_id
    (run / "evaluation").mkdir(parents=True)
    for dim in dims:
        (run / "evaluation" / f"{dim}.json").write_text(json.dumps({
            "dimension": dim, "date": f"{day}T10:00:00+00:00", "principles": [],
            "violations": violations.get(dim, []), "compliance": []}))
    (run / "status.json").write_text(json.dumps({"state": "done", "started_at": f"{day}T10:00:00Z"}))


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


def test_latest_only_by_default_and_cached_second_time(env):
    p = env / "proj"
    _run(p, "r1", "2026-09-01", {"security": [V("x/a.py")]})
    _run(p, "r2", "2026-09-08", {"security": [V("x/a.py")]})
    first = build_map_history(env, "proj")
    assert len(first["frames"]) == 1 and first["frames"][0]["day"] == "2026-09-08"
    assert build_map_history(env, "proj") == first


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
