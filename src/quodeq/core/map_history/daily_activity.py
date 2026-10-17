"""Commits per file per UTC day: what a publisher records so viewers of a shared
project see its git activity without running git on anything the repository says.

Run days are UTC days and a run-to-run transition spans whole days (from the
earlier run's day through the later one's), so per-day counts rebuild
``git_log.commits_per_transition`` exactly.
"""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from quodeq.core.map_history.git_log import Commit
from quodeq.core.map_history.timeline import ISO_DAY_LEN

FORMAT_VERSION = 1
# A shared file is untrusted data: bounded before it is used.
_MAX_DAYS = 4000
_MAX_PATHS_PER_DAY = 20_000
_MAX_PATH_LEN = 1024
_ONE_DAY = timedelta(days=1)


def daily_counts(commits: list[Commit]) -> dict[str, Counter[str]]:
    """``{UTC day: Counter(path -> commits)}`` for *commits*."""
    days: dict[str, Counter[str]] = {}
    for when, paths in commits:
        day = datetime.fromtimestamp(when, tz=timezone.utc).date().isoformat()
        days.setdefault(day, Counter()).update(paths)
    return days


def transitions_from_daily(daily: dict[str, Counter[str]], days: list[str]) -> list[Counter[str]]:
    """Commits per path for each transition of *days* (item 0 empty), from per-day counts."""
    parsed = [date.fromisoformat(d[:ISO_DAY_LEN]) for d in days]
    per: list[Counter[str]] = [Counter() for _ in parsed]
    for i in range(1, len(parsed)):
        day = parsed[i - 1]
        while day <= parsed[i]:
            per[i].update(daily.get(day.isoformat(), {}))
            day += _ONE_DAY
    return per


def _is_day(value: object) -> bool:
    try:
        return isinstance(value, str) and date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def _clean_day(paths: object) -> Counter[str]:
    if not isinstance(paths, dict):
        return Counter()
    return Counter({p: n for p, n in list(paths.items())[:_MAX_PATHS_PER_DAY]
                    if isinstance(p, str) and 0 < len(p) <= _MAX_PATH_LEN
                    and type(n) is int and n > 0})


def parse_daily(raw: object) -> dict[str, Counter[str]] | None:
    """The per-day counts of a published file, well-typed entries only; None when it is not one."""
    if not isinstance(raw, dict) or raw.get("version") != FORMAT_VERSION or not isinstance(raw.get("days"), dict):
        return None
    out: dict[str, Counter[str]] = {}
    for day, paths in list(raw["days"].items())[:_MAX_DAYS]:
        counts = _clean_day(paths)
        if _is_day(day) and counts:
            out[day] = counts
    return out


def to_payload(daily: dict[str, Counter[str]]) -> dict:
    """The JSON a publisher writes for *daily*."""
    return {"version": FORMAT_VERSION, "days": {day: dict(counts) for day, counts in sorted(daily.items())}}
