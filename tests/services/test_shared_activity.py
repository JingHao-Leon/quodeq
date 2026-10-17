"""A shared project's git activity travels as data: the publisher counts commits per day, viewers read them."""
import json
import os
import subprocess
from pathlib import Path

from quodeq.services.map_history import build_map_history
from quodeq.services.shared_activity import stage_activity
from tests.services._map_history_fixtures import env, violation, write_run  # noqa: F401 -- env is a fixture
from tests.services._standards_share_fixtures import _clone, remote  # noqa: F401 -- remote is a fixture


def _git(repo: Path, *args: str, date: str | None = None) -> None:
    extra = {"GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date} if date else {}
    ident = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                   stdin=subprocess.DEVNULL, env={**os.environ, **extra, **ident})


def _repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q")
    (repo / "a.py").write_text("1")
    _git(repo, "add", "a.py")
    _git(repo, "commit", "-qm", "1", date="2026-09-05T10:00:00+00:00")
    return repo


def _project(env, repo):
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {"security": [violation("a.py")]})
    write_run(p, "r2", "2026-09-08", {"security": [violation("a.py")]})
    (p / "repository_info.json").write_text(json.dumps({"path": str(repo)}))
    return p


def test_the_publisher_writes_commits_per_day_over_the_run_span(env, tmp_path):
    p = _project(env, _repo(tmp_path))
    dest = tmp_path / "clone" / "evaluations" / "proj"
    dest.mkdir(parents=True)
    assert stage_activity(p, dest, Path(json.loads((p / "repository_info.json").read_text())["path"]))
    data = json.loads((dest / "map_activity.json").read_text())
    assert data == {"version": 1, "days": {"2026-09-05": {"a.py": 1}}}


def test_no_local_repository_writes_nothing(env, tmp_path):
    p = _project(env, tmp_path / "gone")
    dest = tmp_path / "dest"
    dest.mkdir()
    assert not stage_activity(p, dest, None)
    assert not (dest / "map_activity.json").exists()


def test_a_shared_mirror_reads_the_published_activity_without_git(env, tmp_path, monkeypatch):
    p = _project(env, tmp_path / "not-here")
    (p / "map_activity.json").write_text(json.dumps({"version": 1, "days": {"2026-09-05": {"a.py": 1}}}))
    monkeypatch.setattr("quodeq.services.map_history.git_commits_per_transition", lambda *a: 1 / 0)
    out = build_map_history(env, "proj", git_activity=False)
    assert out.activity_source == "git"
    idx = out.file_names.index("a.py")
    assert next(r for r in out.frames[0].files if r.file == idx).edits == 1


def test_a_malformed_published_file_falls_back_to_the_estimate(env, tmp_path):
    p = _project(env, tmp_path / "not-here")
    (p / "map_activity.json").write_text(json.dumps({"version": 1, "days": "nope"}))
    assert build_map_history(env, "proj", git_activity=False).activity_source == "estimated"


def test_a_publish_carries_the_activity_into_the_shared_repository(env, tmp_path, remote, monkeypatch):
    from quodeq.services import shared_publish
    _project(env, _repo(tmp_path))
    monkeypatch.setattr("quodeq.services._publish_standards.standard_dirs", lambda: (None, None))
    shared_publish.publish_project("proj", remote, evaluations_root=env)
    published = _clone(remote, tmp_path / "check") / "evaluations" / "proj" / "map_activity.json"
    assert json.loads(published.read_text())["days"] == {"2026-09-05": {"a.py": 1}}
