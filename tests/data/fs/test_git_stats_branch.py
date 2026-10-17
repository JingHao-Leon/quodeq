"""checked_out_branch against real temp git repositories."""
from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from quodeq.data.fs.git_stats import checked_out_branch

_GIT_IDENTITY = ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"]


def _git(cwd: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", *_GIT_IDENTITY, *args], cwd=cwd, check=True, capture_output=True, text=True,
        stdin=subprocess.DEVNULL,
    )
    return proc.stdout.strip()


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    (root / "pkg").mkdir(parents=True)
    _git(root, "init", "-b", "dev")
    (root / "pkg" / "a.txt").write_text("x", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "init")
    return root


def test_names_the_checked_out_branch(repo: Path) -> None:
    assert checked_out_branch(str(repo)) == "dev"


def test_branch_names_keep_their_slashes(repo: Path) -> None:
    _git(repo, "checkout", "-b", "feat/thing")

    assert checked_out_branch(str(repo)) == "feat/thing"


def test_detached_head_is_the_short_sha(repo: Path) -> None:
    sha = _git(repo, "rev-parse", "HEAD")
    _git(repo, "checkout", "--detach")

    assert checked_out_branch(str(repo)) == sha[:7]


def test_a_scoped_subfolder_reads_its_repo(repo: Path) -> None:
    assert checked_out_branch(str(repo / "pkg")) == "dev"


def test_a_linked_worktree_reads_its_own_head(repo: Path, tmp_path: Path) -> None:
    other = tmp_path / "wt"
    _git(repo, "worktree", "add", "-b", "side", str(other))

    assert checked_out_branch(str(other)) == "side"
    assert checked_out_branch(str(repo)) == "dev"


def test_not_a_repo_or_no_path_is_none(tmp_path: Path) -> None:
    assert checked_out_branch(str(tmp_path / "missing")) is None
    assert checked_out_branch(None) is None
