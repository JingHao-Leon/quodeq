"""Put the shared clone back at the remote after a push that failed.

A commit whose push failed would otherwise stay in the clone, and the
listing and installs read the clone: an unpushed copy would read as shared.
"""
from __future__ import annotations

import logging
from collections.abc import Mapping
from pathlib import Path

from quodeq.data.fs.shared_repo import clone_lock, refresh_shared_clone, remove_clone_dir
from quodeq.data.fs.shared_repo_git import run_git, shared_repo_path
from quodeq.shared.constants import GIT_DIR_NAME

logger = logging.getLogger(__name__)


def _last_fetched(repo: Path) -> str | None:
    """The remote commit fetched last (FETCH_HEAD, else origin/HEAD), or None."""
    for ref in ("FETCH_HEAD", "refs/remotes/origin/HEAD"):
        ok, out = run_git(["rev-parse", "--verify", "-q", f"{ref}^{{commit}}"], cwd=repo)
        if ok and out.strip():
            return out.strip()
    return None


def reset_clone_to_remote(url: str, env: Mapping[str, str] | None = None) -> None:
    """Drop what a failed push left in the clone: commits the remote never got.

    Fetches and hard-resets (``refresh_shared_clone``). When the remote
    cannot be reached, resets to the remote commit fetched last (read before
    the fetch, which empties FETCH_HEAD when it fails); with neither (an
    empty remote, or one never fetched) removes the clone, so the next use
    clones it again. Never raises.
    """
    with clone_lock(url, env):
        repo = shared_repo_path(url, env)
        if not (repo / GIT_DIR_NAME).exists():
            return
        target = _last_fetched(repo)
        if refresh_shared_clone(url, env)[0]:
            return
        if target is not None:
            ok, out = run_git(["reset", "--hard", target], cwd=repo)
            if ok:
                return
            logger.warning("reset_clone_to_remote: reset failed for %s: %s", url, out.strip()[:200])
        remove_clone_dir(repo)
