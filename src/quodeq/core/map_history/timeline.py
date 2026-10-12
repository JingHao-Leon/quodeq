"""Per-run timeline facts of the map history: running edits, violation ages and new/fixed flows."""
from __future__ import annotations

from collections import Counter
from datetime import date

from quodeq.core.map_history.activity import first_seen_index
from quodeq.core.map_history.snapshot import RunSnapshot, is_violation

# The leading characters of an ISO timestamp that make up its calendar day.
ISO_DAY_LEN = 10


def running_edits(per_transition: list[Counter[str]]) -> list[Counter[str]]:
    """Per run, the edits per path summed over every transition up to and including it."""
    out: list[Counter[str]] = []
    running: Counter[str] = Counter()
    for edits in per_transition:
        running = running + edits
        out.append(running)
    return out


def violation_ids(snapshot: RunSnapshot) -> set[str]:
    """Every violation identity in *snapshot* (compliance judgments excluded)."""
    return {f for stat in snapshot.files.values() for f in stat.ids if is_violation(f)}


def _age_days(starts: list[int], days: list[date], today: date) -> int:
    """Days since the earliest of *starts* (run indexes into *days*), 0 when there is none."""
    return (today - days[min(starts)]).days if starts else 0


def violation_ages(snapshots: list[RunSnapshot], days: list[str], violations: list[set[str]]) -> list[dict[str, int]]:
    """Per run, each file's oldest violation age in days (0 for a file without violations).

    A violation's age runs from the run where its unbroken presence started.
    *days* are the runs' ISO days, oldest first; *violations* each run's
    ``violation_ids``.
    """
    parsed = [date.fromisoformat(d) for d in days]
    out: list[dict[str, int]] = []
    for k, (snap, seen) in enumerate(zip(snapshots, first_seen_index(snapshots), strict=True)):
        here = violations[k]
        out.append({path: _age_days([seen[f] for f in stat.ids if f in here and f in seen], parsed, parsed[k])
                    for path, stat in snap.files.items()})
    return out


def finding_flows(violations: list[set[str]], runs: list[int]) -> dict[int, tuple[int, int]]:
    """``(new, fixed)`` violation counts of each run index in *runs* against the run before it (``(0, 0)`` for the first).

    *violations* are each run's ``violation_ids``, oldest first.
    """
    return {k: (len(violations[k] - violations[k - 1]), len(violations[k - 1] - violations[k])) if k else (0, 0)
            for k in runs}
