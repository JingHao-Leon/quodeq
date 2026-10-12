"""Commits per file between two run dates, for the map's activity."""
from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from pathlib import Path

from quodeq.services.wiring import git_stdout

# A run's day is inclusive: commits up to the end of that day count.
_ONE_DAY = timedelta(days=1)
# git must answer quickly; a slow repo falls back to the estimate.
_TIMEOUT_S = 20
# The leading characters of an ISO timestamp that make up its calendar day.
_ISO_DAY_LEN = 10


def git_commits_between(repo: Path, since_iso: str, until_iso: str) -> Counter[str] | None:
    """Commit count per path between the two days, or None when git is unavailable here."""
    if not (repo / ".git").exists():
        return None
    until = (date.fromisoformat(until_iso[:_ISO_DAY_LEN]) + _ONE_DAY).isoformat()
    try:
        out = git_stdout(
            ["-C", str(repo), "log", "--branches", "--remotes", "--no-merges", "--name-only", "-z",
             "--format=", f"--since={since_iso[:_ISO_DAY_LEN]}T00:00", f"--until={until}T00:00"],
            timeout=_TIMEOUT_S)
    except UnicodeDecodeError:
        return None
    if out is None:
        return None
    return Counter(name for name in out.split("\0") if name.strip("\n"))
