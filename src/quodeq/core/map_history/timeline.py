"""Per-run timeline facts of the map history: running edits, violation ages and new/fixed flows."""
from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from datetime import date

from quodeq.core.map_history.activity import first_seen_index
from quodeq.core.map_history.snapshot import RunSnapshot, is_violation

# The leading characters of an ISO timestamp that make up its calendar day.
ISO_DAY_LEN = 10


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


def violation_counts(snapshot: RunSnapshot, ids: set[str] | None = None) -> Counter[str]:
    """Every violation identity in *snapshot* with how often it was found (what the issue count adds up).

    *ids* are the snapshot's ``violation_ids`` when already known.
    """
    counts = Counter(violation_ids(snapshot) if ids is None else ids)
    for stat in snapshot.files.values():
        counts.update(dict(stat.repeats))
    return counts


def finding_flows(snapshots: list[RunSnapshot], violations: list[set[str]],
                  runs: list[int]) -> dict[int, tuple[int, int]]:
    """``(new, fixed)`` violations of each run index in *runs* against the run before it (``(0, 0)`` for the first).

    *snapshots* are oldest first and carry every dimension forward
    (``carry_forward``): a dimension a run did not report still holds its
    earlier findings, so it neither fixes nor reintroduces them, and a
    dimension's first run brings its findings in as new. *violations* are each
    run's ``violation_ids``. Every occurrence counts, so ``new - fixed`` is the
    change in the run's issue count.
    """
    counted: dict[int, Counter[str]] = {}

    def counts(k: int) -> Counter[str]:
        if k not in counted:
            counted[k] = violation_counts(snapshots[k], violations[k])
        return counted[k]

    return {k: ((counts(k) - counts(k - 1)).total(), (counts(k - 1) - counts(k)).total()) if k else (0, 0)
            for k in runs}
