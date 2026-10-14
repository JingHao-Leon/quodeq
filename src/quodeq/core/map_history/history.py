"""The map history's result: per-run frames of file rows and area metrics, assembled from snapshots."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import NamedTuple

from quodeq.core.map_history.area_metrics import WEIGHT_DECIMALS, AreaMetrics, PathActivity, area_metrics_per_run
from quodeq.core.map_history.areas import AreaAssignment, assign_areas, display_layer
from quodeq.core.map_history.snapshot import RunSnapshot
from quodeq.core.map_history.timeline import (
    ages_from_starts,
    finding_flows,
    running_edits,
    violation_age_starts,
    violation_ids,
)


class FileRow(NamedTuple):
    """One file in one run's frame (a named tuple: a large history holds many thousands)."""

    file: int           # index into ``MapHistory.file_names``
    weight: float
    violations: int
    compliance: int
    critical: int
    major: int
    edits: int          # edits up to and including this run
    age_from: int       # run index where the file's oldest violation chain started, -1 without one


@dataclass(frozen=True)
class MapFrame:
    """One run: its day, violation flow against the run before, file rows and area metrics."""

    day: str
    new: int
    fixed: int
    files: tuple[FileRow, ...]
    areas: tuple[AreaMetrics, ...]


@dataclass(frozen=True)
class MapHistory:
    """The map's history: every file once, plus the requested frames (oldest first)."""

    activity_source: str            # "git", "estimated", or "none" when there is no history
    days: tuple[str, ...]
    file_names: tuple[str, ...]
    file_area: tuple[str, ...]
    file_test: tuple[bool, ...]
    frames: tuple[MapFrame, ...]
    file_layer: tuple[str, ...] = ()   # display layer per file ("" when none), parallel to file_names
    day_runs: tuple[str, ...] = ()     # each day's last run (the run the day is as of), parallel to days


EMPTY_HISTORY = MapHistory("none", (), (), (), (), ())


@dataclass(frozen=True)
class RunActivity:
    """Where the edits came from and, per run, the edits per path in the transition into it (run 0: none)."""

    source: str
    per_transition: tuple[Counter[str], ...]


class _RunFacts(NamedTuple):
    """What every frame draws on, per run (oldest first): edits, violation chain starts, area metrics, and flows of the asked runs."""

    running: list[Counter[str]]         # edits up to and including each run
    starts: list[dict[str, int]]        # oldest violation chain start per path
    metrics: list[list[AreaMetrics]]
    flows: dict[int, tuple[int, int]]


def _run_facts(days: list[str], snapshots: list[RunSnapshot], activity: RunActivity,
               assignments: dict[str, AreaAssignment], frame_runs: list[int]) -> _RunFacts:
    """Every run's timeline facts; flows only for *frame_runs*."""
    running = running_edits(activity.per_transition)
    violations = [violation_ids(s) for s in snapshots]
    starts = violation_age_starts(snapshots, violations)
    ages = ages_from_starts(days, starts)
    per_run = [PathActivity(edits, run_ages) for edits, run_ages in zip(running, ages, strict=True)]
    metrics = area_metrics_per_run(snapshots, assignments, per_run)
    return _RunFacts(running, starts, metrics,
                     finding_flows(snapshots, violations, frame_runs))


def _rows(k: int, snap: RunSnapshot, index: dict[str, int], facts: _RunFacts) -> tuple[FileRow, ...]:
    """Run *k*'s file rows."""
    running, starts = facts.running[k], facts.starts[k]
    return tuple(FileRow(index[p], round(s.weight, WEIGHT_DECIMALS), s.violations, s.compliance, s.critical, s.major,
                         running.get(p, 0), starts[p])
                 for p, s in snap.files.items())


def _frame(k: int, day: str, snap: RunSnapshot, index: dict[str, int], facts: _RunFacts) -> MapFrame:
    """Run *k*'s frame."""
    return MapFrame(day, *facts.flows[k], _rows(k, snap, index, facts), tuple(facts.metrics[k]))


def assemble_history(days: list[str], snapshots: list[RunSnapshot], activity: RunActivity,
                     frame_runs: list[int]) -> MapHistory:
    """The history of *snapshots* (one per day of *days*, oldest first) with frames for the run indexes *frame_runs*.

    Each snapshot carries every dimension forward (``carry_forward``), so it is
    the accumulated view as of its day.

    Area kinds are smoothed over every run, so every run is measured; file rows
    and flows are built only for the requested frames.
    """
    names = sorted({p for s in snapshots for p in s.files})
    index = {p: i for i, p in enumerate(names)}
    assignments = assign_areas(names)
    facts = _run_facts(days, snapshots, activity, assignments, frame_runs)
    frames = tuple(_frame(k, days[k], snapshots[k], index, facts) for k in frame_runs)
    return MapHistory(activity.source, tuple(days), tuple(names), tuple(assignments[p].area for p in names),
                      tuple(assignments[p].is_test for p in names), frames,
                      tuple(display_layer(assignments[p]) for p in names))
