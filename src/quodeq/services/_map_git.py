"""Commits per file between consecutive run dates, for the map's activity."""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from quodeq.core.map_history.git_log import LOG_FORMAT, commits_per_transition, parse_commit_log
from quodeq.core.map_history.timeline import ISO_DAY_LEN
from quodeq.services.wiring import git_stdout

# A run's day is inclusive: commits up to the end of that day count.
_ONE_DAY = timedelta(days=1)
# git must answer quickly; a slow repo falls back to the estimate.
_TIMEOUT_S = 20


def _midnight(day: date) -> int:
    """Epoch seconds of *day*'s UTC midnight (run days are UTC days)."""
    return int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp())


def _git_instant(day: date) -> str:
    """*day*'s UTC midnight as git reads ``--since`` and ``--until``."""
    return f"{day.isoformat()}T00:00:00Z"


def git_commits_per_transition(repo: Path, days: list[str]) -> list[Counter[str]] | None:
    """Per run-to-run transition of *days* (oldest first), commits per path, from one git call.

    Item ``i`` (from 1) counts the commits from ``days[i-1]`` 00:00 through
    the end of ``days[i]``, both in UTC like the run days themselves (a run's
    day is the UTC date it started), the window one ``--since``/``--until``
    call per transition would give. Item 0 is empty. *repo* may be a
    subfolder of its repository: git finds the repository, and only that
    folder's paths count, relative to it like the reports' paths. None when
    git is unavailable or *repo* is not inside a repository.
    """
    if not days:
        return None
    parsed = [date.fromisoformat(d[:ISO_DAY_LEN]) for d in days]
    try:
        out = git_stdout(
            ["-C", str(repo), "log", "--branches", "--remotes", "--no-merges", "--name-only", "--relative", "-z",
             LOG_FORMAT, f"--since={_git_instant(parsed[0])}", f"--until={_git_instant(parsed[-1] + _ONE_DAY)}"],
            timeout=_TIMEOUT_S)
    except UnicodeDecodeError:
        return None  # a path git cannot hand back as UTF-8: fall back to the estimate
    if out is None:
        return None
    return commits_per_transition(parse_commit_log(out),
                                  [_midnight(d) for d in parsed], [_midnight(d + _ONE_DAY) for d in parsed])
