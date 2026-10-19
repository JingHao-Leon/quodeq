"""Tests for --branch and --scope CLI argument handling."""

from __future__ import annotations

import argparse
import subprocess
import os
from pathlib import Path
from unittest.mock import patch


def _make_git_repo(path: Path, branches: list[str] | None = None) -> None:
    """Create a minimal git repo with optional extra branches."""
    env = {
        "GIT_AUTHOR_NAME": "test",
        "GIT_AUTHOR_EMAIL": "t@t",
        "GIT_COMMITTER_NAME": "test",
        "GIT_COMMITTER_EMAIL": "t@t",
        "HOME": str(path),
        "PATH": os.environ["PATH"],
    }
    subprocess.run(["git", "init", str(path)], capture_output=True, check=True)
    subprocess.run(["git", "-C", str(path), "checkout", "-b", "main"], capture_output=True, check=True)
    (path / "README.md").write_text("# test")
    (path / "src").mkdir()
    (path / "src" / "app.py").write_text("print('hello')")
    subprocess.run(["git", "-C", str(path), "add", "."], capture_output=True, check=True)
    subprocess.run(["git", "-C", str(path), "commit", "-m", "init"], capture_output=True, check=True, env=env)
    for branch in (branches or []):
        subprocess.run(["git", "-C", str(path), "checkout", "-b", branch], capture_output=True, check=True)
        (path / "branch_file.txt").write_text(f"from {branch}")
        subprocess.run(["git", "-C", str(path), "add", "."], capture_output=True, check=True)
        subprocess.run(["git", "-C", str(path), "commit", "-m", f"commit on {branch}"], capture_output=True, check=True, env=env)
    subprocess.run(["git", "-C", str(path), "checkout", "main"], capture_output=True, check=True)


class TestCreateWorktree:
    def test_creates_worktree_for_branch(self, tmp_path: Path) -> None:
        from quodeq.cli import create_worktree
        repo = tmp_path / "repo"
        repo.mkdir()
        _make_git_repo(repo, branches=["feature/test"])

        wt = create_worktree(repo, "feature/test")
        try:
            assert wt is not None
            assert wt.is_dir()
            assert (wt / "branch_file.txt").exists()
            assert (wt / "branch_file.txt").read_text() == "from feature/test"
        finally:
            # Clean up even if assertions fail
            if wt is not None:
                subprocess.run(["git", "-C", str(repo), "worktree", "remove", str(wt), "--force"], capture_output=True)

    def test_returns_none_for_nonexistent_branch(self, tmp_path: Path) -> None:
        from quodeq.cli import create_worktree
        repo = tmp_path / "repo"
        repo.mkdir()
        _make_git_repo(repo)

        wt = create_worktree(repo, "nonexistent-branch")
        assert wt is None

    def test_fetches_missing_branch_from_origin(self, tmp_path: Path) -> None:
        """Online repos are registered via a single-branch shallow clone, so a
        branch evaluation targets a branch the clone doesn't have yet; it must
        be fetched from origin instead of failing."""
        from quodeq.cli import create_worktree
        origin = tmp_path / "origin"
        origin.mkdir()
        _make_git_repo(origin, branches=["feature/other"])
        clone = tmp_path / "clone"
        subprocess.run(
            ["git", "clone", "--single-branch", "--branch", "main", str(origin), str(clone)],
            capture_output=True, check=True,
        )

        wt = create_worktree(clone, "feature/other")
        try:
            assert wt is not None
            assert (wt / "branch_file.txt").read_text() == "from feature/other"
        finally:
            if wt is not None:
                subprocess.run(["git", "-C", str(clone), "worktree", "remove", str(wt), "--force"], capture_output=True)


class TestCleanupWorktree:
    def test_removes_worktree(self, tmp_path: Path) -> None:
        from quodeq.cli import create_worktree, cleanup_worktree
        repo = tmp_path / "repo"
        repo.mkdir()
        _make_git_repo(repo, branches=["feature/cleanup"])

        wt = create_worktree(repo, "feature/cleanup")
        assert wt is not None
        assert wt.is_dir()

        cleanup_worktree(repo, wt)
        assert not wt.exists()


class TestCliParserBranchScope:
    def test_branch_arg_parsed(self) -> None:
        from quodeq.cli_parser import build_parser
        parser = build_parser()
        args = parser.parse_args(["evaluate", "/tmp/repo", "--branch", "develop"])
        assert args.branch == "develop"

    def test_scope_arg_parsed(self) -> None:
        from quodeq.cli_parser import build_parser
        parser = build_parser()
        args = parser.parse_args(["evaluate", "/tmp/repo", "--scope", "src/backend"])
        assert args.scope == "src/backend"

    def test_defaults_are_none(self) -> None:
        from quodeq.cli_parser import build_parser
        parser = build_parser()
        args = parser.parse_args(["evaluate", "/tmp/repo"])
        assert args.branch is None
        assert args.scope is None


def _scoped_repo(tmp_path: Path) -> Path:
    """A repository with a "src" folder holding three Python modules."""
    repo = (tmp_path / "repo").resolve()
    (repo / "src").mkdir(parents=True)
    for i in range(3):
        (repo / "src" / f"mod{i}.py").write_text("print('hello')\n")
    return repo


class TestResolveScope:
    def test_scope_is_canonicalized(self, tmp_path: Path) -> None:
        """"./src" and "src" name one directory, so they get one spelling."""
        from quodeq.cli import resolve_scope

        repo = _scoped_repo(tmp_path)
        scope, ok = resolve_scope(repo, argparse.Namespace(scope="./src"))
        assert ok
        assert scope == "src"

    def test_repository_root_scope_is_canonicalized(self, tmp_path: Path) -> None:
        from quodeq.cli import resolve_scope

        repo = _scoped_repo(tmp_path)
        scope, ok = resolve_scope(repo, argparse.Namespace(scope="./"))
        assert ok
        assert scope == ""


class TestScopedEvaluation:
    def test_a_dot_prefixed_scope_still_selects_the_files(self, tmp_path: Path) -> None:
        """--scope ./src must select the same files as --scope src.

        The scope is walked as a path (where "./" is a no-op) and matched
        against the manifest's repo-relative paths, so the two spellings have
        to agree on which files are in scope.
        """
        from quodeq.analysis.manifest import build_manifest
        from quodeq.analysis.manifest_scope import filter_manifest_by_scope
        from quodeq.cli import resolve_scope

        repo = _scoped_repo(tmp_path)
        detection = {"extensions": {".py": "python"}, "skip_dirs": [], "skip_patterns": []}

        scope, ok = resolve_scope(repo, argparse.Namespace(scope="./src"))
        assert ok

        manifest = build_manifest(repo, detection, None, scope_path=scope)
        scoped = filter_manifest_by_scope(manifest, scope)
        assert scoped is not None
        assert scoped.total_files == 3
        assert scoped.source_files == ["src/mod0.py", "src/mod1.py", "src/mod2.py"]

    def test_the_project_identity_uses_the_canonical_scope(self, tmp_path: Path) -> None:
        """The scope a project is filed under is the one the run evaluated."""
        from quodeq.cli import resolve_scope, setup_run_dirs

        repo = _scoped_repo(tmp_path)
        args = argparse.Namespace(repo=str(repo), output=str(tmp_path / "out"), scope="./src")
        scope, ok = resolve_scope(repo, args)
        assert ok
        with patch("quodeq.cli_evaluation.resolve_project_uuid", return_value="proj-uuid") as mock_uuid, \
             patch("quodeq.cli_evaluation.project_name_from_repo", return_value="repo"):
            setup_run_dirs(args, repo)
        identity = mock_uuid.call_args.args[1]
        assert identity.scope_path == "src"
