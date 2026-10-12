import os
import subprocess
import time
from pathlib import Path

import pytest

from quodeq.services._map_git import git_commits_per_transition


def _git(repo: Path, *args: str, date: str | None = None) -> None:
    env = {"GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date} if date else {}
    ident = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
             "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                   stdin=subprocess.DEVNULL, env={**os.environ, **env, **ident})


def _between(repo: Path, since: str, until: str):
    """The single transition from *since* to *until*."""
    got = git_commits_per_transition(repo, [since, until])
    return None if got is None else got[1]


def test_counts_commits_per_file_in_the_window(tmp_path):
    _git(tmp_path, "init", "-q")
    (tmp_path / "a.py").write_text("1")
    _git(tmp_path, "add", "a.py")
    _git(tmp_path, "commit", "-qm", "1", date="2026-09-01T10:00:00+00:00")
    (tmp_path / "a.py").write_text("2")
    (tmp_path / "b.py").write_text("1")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-qm", "2", date="2026-09-10T10:00:00+00:00")
    assert _between(tmp_path, "2026-09-05", "2026-09-12") == {"a.py": 1, "b.py": 1}


def test_not_a_repo_is_none(tmp_path):
    assert git_commits_per_transition(tmp_path, ["2026-09-01", "2026-09-02"]) is None


def _commit_file(repo: Path, name: str, date: str) -> None:
    _git(repo, "init", "-q")
    (repo / name).write_text(date)
    _git(repo, "add", ".")
    _git(repo, "commit", "-qm", "c", date=date)


def test_non_ascii_path_is_counted_under_its_real_name(tmp_path):
    _commit_file(tmp_path, "héllo.py", "2026-09-10T10:00:00+00:00")
    assert _between(tmp_path, "2026-09-05", "2026-09-12") == {"héllo.py": 1}


def test_commit_on_the_until_day_is_included(tmp_path):
    _commit_file(tmp_path, "a.py", "2026-09-12T22:00:00+00:00")
    assert _between(tmp_path, "2026-09-05", "2026-09-12") == {"a.py": 1}


def test_stash_commits_are_not_activity(tmp_path):
    _commit_file(tmp_path, "a.py", "2026-09-01T10:00:00+00:00")
    (tmp_path / "a.py").write_text("wip")
    _git(tmp_path, "stash", date="2026-09-10T10:00:00+00:00")
    assert _between(tmp_path, "2026-09-05", "2026-09-12") == {}


def test_one_call_buckets_every_transition_like_per_window_calls(tmp_path):
    _commit_file(tmp_path, "early.py", "2026-08-30T10:00:00+00:00")  # before the first run: no transition
    _commit_file(tmp_path, "a.py", "2026-09-03T10:00:00+00:00")      # strictly inside the first transition
    _commit_file(tmp_path, "b.py", "2026-09-05T09:00:00+00:00")      # on the middle run's day: both transitions
    _commit_file(tmp_path, "c.py", "2026-09-08T23:00:00+00:00")      # on the last run's day
    _commit_file(tmp_path, "late.py", "2026-09-09T10:00:00+00:00")   # after the last run: no transition
    got = git_commits_per_transition(tmp_path, ["2026-09-01", "2026-09-05", "2026-09-08"])
    assert got == [{}, {"a.py": 1, "b.py": 1}, {"b.py": 1, "c.py": 1}]


def test_a_commit_without_files_is_skipped(tmp_path):
    _commit_file(tmp_path, "a.py", "2026-09-03T10:00:00+00:00")
    _git(tmp_path, "commit", "-q", "--allow-empty", "-m", "e", date="2026-09-03T11:00:00+00:00")
    _commit_file(tmp_path, "b.py", "2026-09-03T12:00:00+00:00")
    assert _between(tmp_path, "2026-09-01", "2026-09-05") == {"a.py": 1, "b.py": 1}


def _apply_tz() -> None:
    """Re-read TZ in this process; Windows has no tzset, and git still reads TZ from the environment."""
    tzset = getattr(time, "tzset", None)
    if tzset is not None:
        tzset()


@pytest.fixture
def tokyo_clock(monkeypatch):
    """A local zone nine hours ahead of UTC, so local and UTC days disagree late in the UTC day."""
    monkeypatch.setenv("TZ", "Asia/Tokyo")
    _apply_tz()
    yield
    monkeypatch.undo()
    _apply_tz()


def test_run_days_are_utc_days(tmp_path, tokyo_clock):
    _commit_file(tmp_path, "early.py", "2026-09-04T23:30:00+00:00")  # the 5th in Tokyo, the 4th in UTC
    _commit_file(tmp_path, "late.py", "2026-09-12T23:30:00+00:00")   # 08:30 on the 13th in Tokyo
    _commit_file(tmp_path, "next.py", "2026-09-13T00:30:00+00:00")   # the next UTC day
    assert _between(tmp_path, "2026-09-05", "2026-09-12") == {"late.py": 1}


def test_a_project_in_a_repo_subfolder_counts_its_own_paths_relative_to_it(tmp_path):
    _git(tmp_path, "init", "-q")
    (tmp_path / "ui" / "src").mkdir(parents=True)
    (tmp_path / "ui" / "src" / "a.js").write_text("1")
    (tmp_path / "other.py").write_text("1")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-qm", "c", date="2026-09-10T10:00:00+00:00")
    assert _between(tmp_path / "ui", "2026-09-05", "2026-09-12") == {"src/a.js": 1}
