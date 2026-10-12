"""Commits per file between consecutive run dates, for the map's activity."""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

from quodeq.core.map_history.git_log import LOG_FORMAT, commits_per_transition, parse_commit_log
from quodeq.core.map_history.timeline import ISO_DAY_LEN
from quodeq.services.wiring import git_stdout

# A run's day is inclusive: commits up to the end of that day count.
_ONE_DAY = timedelta(days=1)
# git must answer quickly; a slow repo falls back to the estimate.
_TIMEOUT_S = 20


def _midnight(day: date) -> int:
    """Epoch seconds of *day*'s local midnight, as git reads ``--since=<day>T00:00``."""
    return int(datetime(day.year, day.month, day.day).timestamp())


def git_commits_per_transition(repo: Path, days: list[str]) -> list[Counter[str]] | None:
    """Per run-to-run transition of *days* (oldest first), commits per path, from one git call.

    Item ``i`` (from 1) counts the commits from ``days[i-1]`` 00:00 through
    the end of ``days[i]``, both in local time as git reads ``--since`` and
    ``--until``, the window one ``--since``/``--until`` call per transition
    would give. Item 0 is empty. None when git is unavailable here.
    """
    if not days or not (repo / ".git").exists():
        return None
    parsed = [date.fromisoformat(d[:ISO_DAY_LEN]) for d in days]
    try:
        out = git_stdout(
            ["-C", str(repo), "log", "--branches", "--remotes", "--no-merges", "--name-only", "-z", LOG_FORMAT,
             f"--since={parsed[0].isoformat()}T00:00", f"--until={(parsed[-1] + _ONE_DAY).isoformat()}T00:00"],
            timeout=_TIMEOUT_S)
    except UnicodeDecodeError:
        return None  # a path git cannot hand back as UTF-8: fall back to the estimate
    if out is None:
        return None
    return commits_per_transition(parse_commit_log(out),
                                  [_midnight(d) for d in parsed], [_midnight(d + _ONE_DAY) for d in parsed])
