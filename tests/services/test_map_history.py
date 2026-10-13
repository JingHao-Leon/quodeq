import json
import os
import subprocess
from pathlib import Path

import pytest

from quodeq.core.map_history.history import EMPTY_HISTORY
from quodeq.core.map_history.raw_run import RawHistory
from quodeq.services import map_history
from quodeq.services.map_history import build_map_history
from tests.services._map_history_fixtures import (  # noqa: F401 -- env/cached_runs are pytest fixtures
    DIMS, write_run, write_two_runs, violation, cached_runs, env,
)


def test_estimated_history_with_a_new_dimension_midway(env):
    p = env / "proj"
    stable = [violation(f"feature-b/src/S{i}.kt", snip=f"s{i}()") for i in range(5)]
    write_run(p, "r1", "2026-09-01", {"security": [violation("feature-a/src/A.kt"), *stable]}, dims=("security",))
    write_run(p, "r2", "2026-09-08", {"security": [violation("feature-a/src/A.kt", snip="changed()"), *stable]})
    write_run(p, "r3", "2026-09-15", {"security": [violation("feature-a/src/A.kt", snip="changed()"), *stable]})
    out = build_map_history(env, "proj", frames="all")
    assert out.activity_source == "estimated"
    assert list(out.days) == ["2026-09-01", "2026-09-08", "2026-09-15"]
    a = out.file_names.index("feature-a/src/A.kt")
    assert out.file_area[a] == "a"
    assert [next(r for r in f.files if r.file == a).edits for f in out.frames] == [0, 1, 1]


def test_latest_frame_only_by_default(env):
    write_two_runs(env)
    assert [f.day for f in build_map_history(env, "proj").frames] == ["2026-09-08"]


def test_an_unknown_frames_value_is_refused(env):
    write_two_runs(env)
    with pytest.raises(ValueError):
        build_map_history(env, "proj", frames="some")


def test_the_second_call_builds_no_snapshot(env, monkeypatch):
    write_two_runs(env)
    first = build_map_history(env, "proj")
    calls = []
    real = map_history.build_raw_run
    monkeypatch.setattr(map_history, "build_raw_run", lambda *a, **kw: calls.append(1) or real(*a, **kw))
    assert build_map_history(env, "proj") == first
    assert calls == []


def test_unreadable_reports_are_skipped(env):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {"security": [violation("x/a.py")]})
    (p / "r1" / "evaluation" / "maintainability.json").write_text("{not json")
    write_run(p, "r2", "2026-09-08", {"security": [violation("x/a.py")]})
    assert build_map_history(env, "proj").frames[0].day == "2026-09-08"


def test_git_activity_when_the_project_is_a_repo(env, tmp_path):
    repo = _repo_with_a_commit(tmp_path, "2026-09-05")
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {"security": [violation("a.py")]})
    write_run(p, "r2", "2026-09-08", {"security": [violation("a.py")]})
    (p / "repository_info.json").write_text(json.dumps({"path": str(repo)}))
    out = build_map_history(env, "proj")
    assert out.activity_source == "git"
    idx = out.file_names.index("a.py")
    assert next(r for r in out.frames[0].files if r.file == idx).edits == 1


def test_unknown_project_is_empty(env):
    assert build_map_history(env, "nope") == EMPTY_HISTORY


def test_unfinished_runs_are_not_cached_and_new_dimensions_show_up(env, cached_runs):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {"security": [violation("x/a.py")]})
    write_run(p, "r2", "2026-09-08", {"security": [violation("x/a.py")]}, dims=("security",), state="running")
    (p / "r2" / ".pid").write_text(str(os.getpid()))  # a live process keeps the run RUNNING
    out = build_map_history(env, "proj")
    assert list(out.days) == ["2026-09-01", "2026-09-08"]
    assert cached_runs == {"r1"}
    (p / "r2" / ".pid").unlink()
    write_run(p, "r2", "2026-09-08", {"security": [violation("x/a.py")], "maintainability": [violation("x/b.py", snip="b()")]})
    out = build_map_history(env, "proj")
    assert "x/b.py" in out.file_names
    assert cached_runs == {"r1", "r2"}


def test_run_without_a_usable_day_is_skipped(env):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {"security": [violation("x/a.py")]})
    write_run(p, "r2", "", {"security": [violation("x/a.py")]})
    assert build_map_history(env, "proj").days == ("2026-09-01",)


def test_a_cache_miss_is_rebuilt_to_the_same_history(env, monkeypatch):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {"security": [violation("x/a.py")]})
    first = build_map_history(env, "proj")
    monkeypatch.setattr(map_history, "load_map_snapshots", lambda project, keys: RawHistory({}, {}))
    assert build_map_history(env, "proj") == first


def test_history_is_not_capped_at_the_default_run_limit(env, monkeypatch):
    seen = {}
    real = map_history.ProjectRows.load

    def spy(root, project, *a, **kw):
        seen.update(kw)
        return real(root, project, *a, **kw)
    monkeypatch.setattr(map_history.ProjectRows, "load", spy)
    write_run(env / "proj", "r1", "2026-09-01", {"security": [violation("x/a.py")]})
    build_map_history(env, "proj")
    assert seen == {"run_limit": 0}


def _repo_with_a_commit(tmp_path: Path, day: str) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    gitenv = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
              "GIT_COMMITTER_EMAIL": "t@t", "GIT_AUTHOR_DATE": f"{day}T10:00:00", "GIT_COMMITTER_DATE": f"{day}T10:00:00"}
    subprocess.run(["git", "-C", str(repo), "init", "-q"], check=True)
    (repo / "a.py").write_text("1")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "c"], check=True, env=gitenv)
    return repo


def test_warm_call_reads_no_report_and_calls_git_once(env, tmp_path, monkeypatch):
    p = env / "proj"
    for i, day in enumerate(("2026-09-01", "2026-09-08", "2026-09-15")):
        write_run(p, f"r{i}", day, {"security": [violation("a.py")]})
    (p / "repository_info.json").write_text(json.dumps({"path": str(_repo_with_a_commit(tmp_path, "2026-09-05"))}))
    first = build_map_history(env, "proj", frames="all")
    reads, git_calls = [], []
    real_read, real_git = map_history.iter_readable_eval_reports, map_history.git_commits_per_transition
    monkeypatch.setattr(map_history, "iter_readable_eval_reports", lambda d: reads.append(d) or real_read(d))
    monkeypatch.setattr(map_history, "git_commits_per_transition", lambda *a: git_calls.append(a) or real_git(*a))
    assert build_map_history(env, "proj", frames="all") == first
    assert first.activity_source == "git"
    assert reads == []
    assert len(git_calls) <= 1


def test_the_run_is_dated_by_its_start_like_history(env):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {"security": [violation("x/a.py")]})
    report = p / "r1" / "evaluation" / "security.json"
    report.write_text(json.dumps({**json.loads(report.read_text()), "date": "2026-09-02T01:00:00+00:00"}))
    assert build_map_history(env, "proj").days == ("2026-09-01",)


def test_the_days_last_run_stands_for_the_day(env):
    p = env / "proj"
    write_run(p, "b-morning", "2026-09-08", {"security": [violation("x/morning.py")]}, at="08:00:00")
    write_run(p, "a-evening", "2026-09-08", {"security": [violation("x/evening.py")]}, at="20:00:00")
    assert build_map_history(env, "proj").file_names == ("x/evening.py",)


def test_a_cache_miss_whose_reports_are_unreadable_gives_way_to_the_days_earlier_run(env):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {"security": [violation("x/a.py")]})
    write_run(p, "r2", "2026-09-08", {"security": [violation("x/morning.py")]}, at="08:00:00")
    write_run(p, "r3", "2026-09-08", {"security": [violation("x/evening.py", snip="b()")]}, at="20:00:00")
    for dim in DIMS:
        (p / "r3" / "evaluation" / f"{dim}.json").write_text("{not json")
    out = build_map_history(env, "proj")
    assert list(out.days) == ["2026-09-01", "2026-09-08"]
    assert "x/morning.py" in out.file_names and "x/evening.py" not in out.file_names


def _latest_files(env) -> dict[str, int]:
    out = build_map_history(env, "proj")
    return {out.file_names[r.file]: r.violations for r in out.frames[-1].files}


def test_dismissed_deleted_and_rule_hidden_findings_do_not_count(env):
    from quodeq.services.deleted import delete_finding
    from quodeq.services.dismissed import dismiss_finding
    p = env / "proj"
    gone = {"dismissed.py": "R1", "deleted.py": "R2", "ruled.py": "R3", "kept.py": "R4"}
    write_run(p, "r1", "2026-09-01", {"security": [
        {**violation(f"x/{name}", req=req, snip=f"{req}()"), "principle": "Secure Design"}
        for name, req in gone.items()]})
    assert set(_latest_files(env)) == {f"x/{name}" for name in gone}
    dismiss_finding(p, {"req": "R1", "file": "x/dismissed.py", "line": 1, "snippet": "R1()"})
    delete_finding(p, {"dimension": "security", "principle": "Secure Design", "file": "x/deleted.py"})
    (p / "suppression_rules.json").write_text(json.dumps(
        {"version": 1, "rules": [{"req": "R3", "file": "x/*", "reason": "fixture"}]}))
    assert _latest_files(env) == {"x/kept.py": 1}


def test_a_run_missing_a_dimension_neither_fixes_nor_ages_its_findings(env):
    p = env / "proj"
    three = ("security", "maintainability", "reliability")
    same = {d: [violation(f"x/{d}{i}.py", req=f"R{i}") for i in range(5)] for d in three}
    for rid, day in (("r1", "2026-09-01"), ("r2", "2026-09-02"), ("r3", "2026-09-03")):
        write_run(p, rid, day, same, dims=three[:2] if rid == "r2" else three)
    out = build_map_history(env, "proj", frames="all")
    assert [(f.new, f.fixed) for f in out.frames] == [(0, 0)] * 3
    assert {r.age_from for r in out.frames[-1].files} == {0}

