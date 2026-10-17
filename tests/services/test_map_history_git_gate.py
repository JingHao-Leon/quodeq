"""Git activity runs only on this machine's own working copy, never on a path a shared mirror recorded."""
import json

import pytest

from quodeq.services import map_history
from quodeq.services.map_history import build_map_history
from tests.services._map_history_fixtures import env, violation, write_run  # noqa: F401 -- env is a fixture
from tests.services.test_map_history import _repo_with_a_commit


def _two_runs(env, path):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {"security": [violation("a.py")]})
    write_run(p, "r2", "2026-09-08", {"security": [violation("a.py")]})
    (p / "repository_info.json").write_text(json.dumps({"path": path}))


def _no_git(monkeypatch):
    calls = []
    monkeypatch.setattr(map_history, "git_commits_per_transition", lambda *a: calls.append(a))
    return calls


def test_a_shared_mirror_never_runs_git_even_on_a_real_repo(env, tmp_path, monkeypatch):
    _two_runs(env, str(_repo_with_a_commit(tmp_path, "2026-09-05")))
    calls = _no_git(monkeypatch)
    assert build_map_history(env, "proj", git_activity=False).activity_source == "estimated"
    assert calls == []


@pytest.mark.parametrize("path", ["https://github.com/o/r.git", r"\\attacker.example\share", "/no/such/dir"])
def test_a_path_that_is_not_a_local_folder_never_reaches_git(env, monkeypatch, path):
    _two_runs(env, path)
    calls = _no_git(monkeypatch)
    assert build_map_history(env, "proj").activity_source == "estimated"
    assert calls == []
