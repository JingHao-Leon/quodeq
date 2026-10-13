"""Per-run timeline facts of the map history: running edits, violation ages and new/fixed flows."""
from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Sequence
from datetime import date

from quodeq.core.map_history.activity import first_seen_index
from quodeq.core.map_history.snapshot import RunSnapshot, ids_in_dims, is_violation

# The leading characters of an ISO timestamp that make up its calendar day.
ISO_DAY_LEN = 10
# Dimensions a run may miss against the usual count and still be a full run.
FULL_RUN_SLACK = 1


def full_run_dimensions(dimension_counts: Iterable[int]) -> int:
    """How many dimensions a run needs to be a full run: the most common count, less ``FULL_RUN_SLACK`` (at least 1).

    *dimension_counts* holds each run's dimension count (at least one run).
    """
    usual = Counter(dimension_counts).most_common(1)[0][0]
    return max(1, usual - FULL_RUN_SLACK)


def running_edits(per_transition: Sequence[Counter[str]]) -> list[Counter[str]]:
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


# The chain start of a file without a violation.
NO_VIOLATION_START = -1


def violation_age_starts(snapshots: list[RunSnapshot], violations: list[set[str]]) -> list[dict[str, int]]:
    """Per run, each file's oldest violation chain start (a run index), NO_VIOLATION_START without a violation.

    A violation's chain starts at the run where its unbroken presence began;
    *violations* are each run's ``violation_ids``. A start stays the same run
    after run, which keeps delta frames small.
    """
    out: list[dict[str, int]] = []
    for k, (snap, seen) in enumerate(zip(snapshots, first_seen_index(snapshots), strict=True)):
        here = violations[k]
        out.append({path: min((seen[f] for f in stat.ids if f in here and f in seen), default=NO_VIOLATION_START)
                    for path, stat in snap.files.items()})
    return out


def ages_from_starts(days: list[str], starts: list[dict[str, int]]) -> list[dict[str, int]]:
    """Per run, each file's oldest violation age in days (0 for a file without violations)."""
    parsed = [date.fromisoformat(d) for d in days]
    return [{path: (parsed[k] - parsed[s]).days if s != NO_VIOLATION_START else 0 for path, s in run.items()}
            for k, run in enumerate(starts)]


def _flow(prev: RunSnapshot, cur: RunSnapshot, prev_ids: set[str], cur_ids: set[str]) -> tuple[int, int]:
    """``(new, fixed)`` from *prev* to *cur*, over the dimensions both runs ran."""
    shared = set(prev.dims) & set(cur.dims)
    before, after = ids_in_dims(prev_ids, shared), ids_in_dims(cur_ids, shared)
    return len(after - before), len(before - after)


def finding_flows(snapshots: list[RunSnapshot], violations: list[set[str]], runs: list[int]) -> dict[int, tuple[int, int]]:
    """``(new, fixed)`` violation counts of each run index in *runs* against the run before it (``(0, 0)`` for the first).

    *violations* are each run's ``violation_ids``, oldest first. Only the
    dimensions both runs ran are compared, so a run that skipped a dimension
    neither fixes nor reintroduces its findings.
    """
    return {k: _flow(snapshots[k - 1], snapshots[k], violations[k - 1], violations[k]) if k else (0, 0)
            for k in runs}
