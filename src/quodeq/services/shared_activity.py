"""The git activity a publish carries, so viewers of a shared project see real edits.

The publisher's machine has the working copy: it counts commits per file per
UTC day over the project's run span and writes them next to the runs. Viewers
read that file (``map_history``) and never run git on a path the shared
repository names.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

from quodeq.core.map_history.daily_activity import daily_counts, to_payload
from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.core.map_history.timeline import ISO_DAY_LEN
from quodeq.services._map_git import git_commits_between
from quodeq.services._publish_staging import list_completed_runs
from quodeq.services.wiring import read_status
from quodeq.services.wiring_sync import write_published_activity


def _first_run_day(project_dir: Path) -> date | None:
    """The UTC day the project's earliest completed run started, or None."""
    days = []
    for run in list_completed_runs(project_dir):
        started = str((read_status(run) or {}).get("started_at") or "")[:ISO_DAY_LEN]
        try:
            days.append(date.fromisoformat(started))
        except ValueError:
            continue
    return min(days) if days else None


def stage_activity(project_dir: Path, dest_project_dir: Path, repo_root: Path | None,
                   *, log: LogSink = NULL_LOG) -> bool:
    """Write the project's commits per day into the staged project; False when there is nothing to write.

    *repo_root* is this machine's working copy (``local_repo_root``); without
    one, or when git cannot answer, the shared project keeps the estimate.
    """
    if repo_root is None:
        return False
    first = _first_run_day(project_dir)
    if first is None:
        return False
    commits = git_commits_between(repo_root, first, datetime.now(timezone.utc).date())
    if commits is None:
        log.info(f"No git activity published for {project_dir.name}: git could not read {repo_root}")
        return False
    write_published_activity(dest_project_dir, to_payload(daily_counts(commits)))
    return True
