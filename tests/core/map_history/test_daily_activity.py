"""Commits per UTC day, and run-to-run transitions rebuilt from them, equal the local git reading."""
from collections import Counter
from datetime import datetime, timezone

from quodeq.core.map_history.daily_activity import daily_counts, parse_daily, transitions_from_daily
from quodeq.core.map_history.git_log import Commit, commits_per_transition


def _at(day: str, hour: int = 12) -> int:
    return int(datetime.fromisoformat(f"{day}T{hour:02d}:00:00").replace(tzinfo=timezone.utc).timestamp())


def _bounds(days):
    starts = [_at(d, 0) for d in days]
    return starts, [s + 86399 for s in starts]


def test_transitions_from_daily_counts_equal_the_direct_reading():
    commits = [Commit(_at("2026-09-01"), ("a.py",)), Commit(_at("2026-09-03", 23), ("a.py", "b.py")),
               Commit(_at("2026-09-05", 0), ("b.py",)), Commit(_at("2026-09-09"), ("c.py",))]
    days = ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-10"]
    direct = commits_per_transition(commits, *_bounds(days))
    assert transitions_from_daily(daily_counts(commits), days) == direct


def test_daily_counts_bucket_by_utc_day():
    commits = [Commit(_at("2026-09-01", 1), ("a.py",)), Commit(_at("2026-09-01", 22), ("a.py",))]
    assert daily_counts(commits) == {"2026-09-01": Counter({"a.py": 2})}


def test_parse_daily_keeps_well_typed_entries_and_refuses_junk():
    good = {"version": 1, "days": {"2026-09-01": {"a.py": 2}}}
    assert parse_daily(good) == {"2026-09-01": Counter({"a.py": 2})}
    assert parse_daily({"version": 1, "days": {"2026-09-01": {"a.py": -1, "b.py": "x", "c.py": 1}}}) == {
        "2026-09-01": Counter({"c.py": 1})}
    assert parse_daily({"version": 1, "days": {"not-a-day": {"a.py": 1}}}) == {}
    assert parse_daily({"version": 99, "days": {}}) is None
    assert parse_daily(["x"]) is None
