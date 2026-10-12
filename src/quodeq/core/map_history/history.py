"""The map history's result: per-run frames of file rows and area metrics, assembled from snapshots."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import NamedTuple

from quodeq.core.map_history.area_metrics import AreaMetrics, area_metrics_per_run
from quodeq.core.map_history.areas import assign_areas
from quodeq.core.map_history.snapshot import RunSnapshot
from quodeq.core.map_history.timeline import finding_flows, running_edits, violation_ages, violation_ids

# Decimal places kept of a file's severity weight.
_WEIGHT_DECIMALS = 2


class FileRow(NamedTuple):
    """One file in one run's frame (a named tuple: a large history holds many thousands)."""

    file: int           # index into ``MapHistory.file_names``
    weight: float
    violations: int
    compliance: int
    critical: int
    major: int
    edits: int          # edits up to and including this run
    touched: bool       # edited in the transition into this run
    age_days: int       # age of the file's oldest violation


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


EMPTY_HISTORY = MapHistory("none", (), (), (), (), ())


@dataclass(frozen=True)
class RunActivity:
    """Where the edits came from and, per run, the edits per path in the transition into it (run 0: none)."""

    source: str
    per_transition: list[Counter[str]]


def _rows(snap: RunSnapshot, index: dict[str, int], edits: tuple[Counter[str], Counter[str]],
          ages: dict[str, int]) -> tuple[FileRow, ...]:
    """One run's file rows; *edits* is ``(running edits, this transition's edits)``."""
    running, transition = edits
    return tuple(FileRow(index[p], round(s.weight, _WEIGHT_DECIMALS), s.violations, s.compliance, s.critical, s.major,
                         running.get(p, 0), bool(transition.get(p)), ages[p])
                 for p, s in snap.files.items())


def assemble_history(days: list[str], snapshots: list[RunSnapshot], activity: RunActivity,
                     frame_runs: list[int]) -> MapHistory:
    """The history of *snapshots* (one per day of *days*, oldest first) with frames for the run indexes *frame_runs*.

    Area kinds are smoothed over every run, so every run is measured; file rows
    and flows are built only for the requested frames.
    """
    names = sorted({p for s in snapshots for p in s.files})
    index = {p: i for i, p in enumerate(names)}
    assignments = assign_areas(names)
    running = running_edits(activity.per_transition)
    violations = [violation_ids(s) for s in snapshots]
    ages = violation_ages(snapshots, days, violations)
    metrics = area_metrics_per_run(snapshots, assignments, running, ages)
    flows = finding_flows(snapshots, violations, frame_runs)
    frames = tuple(MapFrame(days[k], *flows[k], _rows(snapshots[k], index, (running[k], activity.per_transition[k]), ages[k]),
                            tuple(metrics[k])) for k in frame_runs)
    return MapHistory(activity.source, tuple(days), tuple(names), tuple(assignments[p].area for p in names),
                      tuple(assignments[p].is_test for p in names), frames)
