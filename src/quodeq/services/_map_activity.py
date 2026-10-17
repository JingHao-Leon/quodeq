"""Where the Map's edits per file come from: git on this machine's working copy,
the activity a publisher shared with the project, or an estimate from how the
findings changed between runs."""
from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from pathlib import Path

from quodeq.core.map_history.activity import estimate_edits
from quodeq.core.map_history.daily_activity import parse_daily, transitions_from_daily
from quodeq.core.map_history.history import RunActivity
from quodeq.core.map_history.snapshot import RunSnapshot
from quodeq.services._fs_project_primitives import repo_attach_reason
from quodeq.services.wiring import read_repository_info
from quodeq.services.wiring_sync import read_published_activity

SOURCE_GIT = "git"
SOURCE_ESTIMATED = "estimated"

GitReader = Callable[[Path, list[str]], "list[Counter[str]] | None"]


def _estimated(snaps: list[RunSnapshot]) -> RunActivity:
    """Edits estimated from finding changes between consecutive runs."""
    return RunActivity(SOURCE_ESTIMATED,
                       (Counter(), *(Counter(estimate_edits(snaps[i - 1], s)) for i, s in enumerate(snaps[1:], start=1))))


def _from_git(project_dir: Path, days: list[str], read_git: GitReader) -> list[Counter[str]] | None:
    """Per transition from git, only on a recorded path that is a local folder."""
    path = repo_attach_reason(read_repository_info(project_dir) or {})[0]
    if path is None:
        return None
    return read_git(Path(path), days) if len(days) > 1 else [Counter()]


def _from_published(project_dir: Path, days: list[str]) -> list[Counter[str]] | None:
    """Per transition from the activity the publisher shared (``map_activity.json``)."""
    daily = parse_daily(read_published_activity(project_dir))
    return None if daily is None else transitions_from_daily(daily, days)


def run_activity(project_dir: Path, days: list[str], snaps: list[RunSnapshot], use_git: bool,
                 read_git: GitReader) -> RunActivity:
    """Per transition, edits per path (index 0 is empty) and where they came from.

    A local project reads git on its working copy; a shared mirror (*use_git*
    False, its recorded path was written by someone else) reads the activity
    its publisher shared. Either falls back to the estimate.
    """
    got = _from_git(project_dir, days, read_git) if use_git else _from_published(project_dir, days)
    if got is None:
        return _estimated(snaps)
    return RunActivity(SOURCE_GIT, tuple(Counter({p: n for p, n in c.items() if p in snaps[i].files})
                                         for i, c in enumerate(got)))
