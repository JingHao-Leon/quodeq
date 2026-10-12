import os
import subprocess
from pathlib import Path

from quodeq.services._map_git import git_commits_between


def _git(repo: Path, *args: str, date: str | None = None) -> None:
    env = {"GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date} if date else {}
    ident = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
             "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                   stdin=subprocess.DEVNULL, env={**os.environ, **env, **ident})


def test_counts_commits_per_file_in_the_window(tmp_path):
    _git(tmp_path, "init", "-q")
    (tmp_path / "a.py").write_text("1")
    _git(tmp_path, "add", "a.py")
    _git(tmp_path, "commit", "-qm", "1", date="2026-09-01T10:00:00")
    (tmp_path / "a.py").write_text("2")
    (tmp_path / "b.py").write_text("1")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-qm", "2", date="2026-09-10T10:00:00")
    got = git_commits_between(tmp_path, "2026-09-05", "2026-09-12")
    assert got == {"a.py": 1, "b.py": 1}


def test_not_a_repo_is_none(tmp_path):
    assert git_commits_between(tmp_path, "2026-09-01", "2026-09-02") is None
