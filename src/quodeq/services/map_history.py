"""The map's history: per-run file stats, functional areas, activity and area
kinds. Each run is cached raw in the score cache (``map_snapshot`` plus the
project's ``map_finding`` records); suppression and the grade formula's
severity weights apply when the history is read, so neither ever rebuilds a
cached run."""
from __future__ import annotations

from collections import Counter
from collections.abc import Mapping
from dataclasses import replace
from datetime import date
from pathlib import Path
from typing import NamedTuple

from quodeq.core.map_history.activity import estimate_edits
from quodeq.core.map_history.history import EMPTY_HISTORY, MapHistory, RunActivity, assemble_history
from quodeq.core.map_history.raw_run import (
    RawHistory, RawHistoryWrite, RawRun, ViolationRecord, build_raw_run, materialise, referenced_records,
)
from quodeq.core.map_history.snapshot import RunSnapshot
from quodeq.core.map_history.timeline import ISO_DAY_LEN, full_run_dimensions
from quodeq.core.finding_identity import SuppressionSubject
from quodeq.core.run.state import RunState
from quodeq.services._map_git import git_commits_per_transition
from quodeq.services._violation_filters import is_suppressed_subject, suppression_subject
from quodeq.services.scoring import ProjectRows
from quodeq.services.suppression_keys import SuppressionKeys
from quodeq.services.wiring import (
    eval_report_dimensions,
    iter_readable_eval_reports,
    load_map_snapshots,
    load_suppression_rules,
    project_dir_exists,
    read_repository_info,
    save_map_snapshots,
)

# The ``frames`` values: the latest frame only (the default), or every frame.
LATEST_FRAMES = "latest"
ALL_FRAMES = "all"
FRAME_CHOICES = (LATEST_FRAMES, ALL_FRAMES)
# Snapshot payload shape: bump to invalidate every cached run (3: raw runs and records, suppression applied when
# read; 4: compliance counted per dimension, so a run can carry a dimension it did not report).
SNAPSHOT_SHAPE = "4"
_SOURCE_GIT = "git"
_SOURCE_ESTIMATED = "estimated"


class _Candidate(NamedTuple):
    """A run that may stand for its day on the timeline."""

    day: str
    run_id: str
    dims: list[str]                              # report dimensions
    reports: list[tuple[str, dict]] | None       # parsed reports, None until read


class _DayRun(NamedTuple):
    """The run picked for one day, raw, with the records read for it now (none when cached)."""

    run_id: str
    run: RawRun
    records: dict[str, ViolationRecord]
    built_now: bool


def _valid_day(day: str) -> bool:
    """True when *day* is an ISO calendar date; runs without one cannot be placed on the timeline."""
    try:
        date.fromisoformat(day)
    except ValueError:
        return False
    return True


def _readable_reports(run_dir: Path) -> list[tuple[str, dict]]:
    """``(dimension, report)`` for each readable report object of *run_dir*."""
    return [(dim, data) for dim, data in iter_readable_eval_reports(run_dir) if isinstance(data, dict)]


def _undated_candidate(run_id: str, run_dir: Path) -> _Candidate | None:
    """A run without a date, dated by its reports' latest date; None when none is readable."""
    reports = _readable_reports(run_dir)
    if not reports:
        return None
    day = max(str(d.get("date") or "")[:ISO_DAY_LEN] for _, d in reports)
    return _Candidate(day, run_id, sorted(dim for dim, _ in reports), reports)


def _candidates(rows: ProjectRows) -> list[_Candidate]:
    """Runs with reports and a usable day, in ``rows.runs`` order.

    Dimensions come from the report file names and the day from the run's
    date (what History shows), so no report is read; a run without a date is
    read for its reports' latest date instead, and keeps only its readable
    dimensions.
    """
    out: list[_Candidate] = []
    for run in rows.runs:
        run_dir = rows.reports_root / rows.project / run.run_id
        dims = eval_report_dimensions(run_dir)
        if not dims:
            continue
        if run.date_iso:
            cand: _Candidate | None = _Candidate(run.date_iso[:ISO_DAY_LEN], run.run_id, dims, None)
        else:
            cand = _undated_candidate(run.run_id, run_dir)
        if cand is not None and _valid_day(cand.day):
            out.append(cand)
    return out


def _full_by_day(candidates: list[_Candidate]) -> tuple[dict[str, list[_Candidate]], int]:
    """Full-run candidates grouped by day and the dimension count a full run needs.

    Days ascend; each day keeps the run order of *candidates* (newest first,
    as ``rows.runs`` lists them), so a group's head is the day's last run.
    """
    need = full_run_dimensions(len(c.dims) for c in candidates)
    by_day: dict[str, list[_Candidate]] = {}
    for c in sorted((c for c in candidates if len(c.dims) >= need), key=lambda c: c.day):
        by_day.setdefault(c.day, []).append(c)
    return by_day, need


def _cache_keys(rows: ProjectRows, by_day: dict[str, list[_Candidate]]) -> dict[str, str]:
    """The cache key of every finished candidate run: the payload shape and the run's dimensions.

    Suppression and the grade formula apply when a run is read, so neither is
    part of the key; a finished run's reports are never rewritten.
    """
    finished = {r.run_id for r in rows.runs if r.status == RunState.DONE}
    return {c.run_id: f"{SNAPSHOT_SHAPE}|{','.join(c.dims)}"
            for group in by_day.values() for c in group if c.run_id in finished}


def _subject_of(dimension: str, violation: dict) -> SuppressionSubject:
    """The suppression subject of one report violation."""
    return suppression_subject(violation, dimension)


def _suppression_keys(rows: ProjectRows) -> SuppressionKeys:
    """The project's dismissed, deleted and pattern-rule state."""
    return replace(rows.keys, rules=load_suppression_rules(rows.reports_root / rows.project))


def _hidden(rows: ProjectRows, records: dict[str, ViolationRecord], needed: set[str]) -> frozenset[str]:
    """The record keys of *needed* the app hides, each distinct record judged once."""
    keys = _suppression_keys(rows)
    return frozenset(k for k in needed if is_suppressed_subject(records[k].subject, keys))


def _day_run(rows: ProjectRows, group: list[_Candidate], stored: RawHistory, need: int) -> _DayRun | None:
    """The day's last run that is cached or reads as full, else None.

    *group* is newest first: an earlier run of the day stands in only when
    every later one is uncached and reads short of a full run.
    """
    for c in group:
        if c.run_id in stored.runs:
            return _DayRun(c.run_id, stored.runs[c.run_id], {}, False)
        reports = c.reports if c.reports is not None else _readable_reports(rows.reports_root / rows.project / c.run_id)
        if len(reports) >= need:
            built = build_raw_run(reports, _subject_of)
            return _DayRun(c.run_id, built.run, built.records, True)
    return None


def _save(rows: ProjectRows, picked: dict[str, _DayRun], keys: dict[str, str]) -> None:
    """Store the fresh finished runs and their records; keep only what the picked finished runs use."""
    kept = [p for p in picked.values() if p.run_id in keys]
    fresh = [p for p in kept if p.built_now]
    save_map_snapshots(rows.project, RawHistoryWrite(
        runs={p.run_id: (keys[p.run_id], p.run) for p in fresh},
        records={k: r for p in fresh for k, r in p.records.items()},
        keep_runs={p.run_id for p in kept},
        keep_records=referenced_records(p.run for p in kept),
    ))


def _history(rows: ProjectRows) -> tuple[list[str], list[RunSnapshot]]:
    """Oldest-first days and snapshots of the full runs, one per day (the last of that day).

    Only finished runs are read from or stored in the cache, and reports are
    read only for runs it does not hold; a run whose readable reports fall
    short of a full run gives way to the day's previous run.
    """
    candidates = _candidates(rows)
    if not candidates:
        return [], []
    by_day, need = _full_by_day(candidates)
    keys = _cache_keys(rows, by_day)
    stored = load_map_snapshots(rows.project, keys)
    picked = {day: got for day, group in by_day.items()
              if (got := _day_run(rows, group, stored, need)) is not None}
    _save(rows, picked, keys)
    records = {**stored.records, **{k: r for p in picked.values() for k, r in p.records.items()}}
    runs = [p.run for p in picked.values()]
    hidden = _hidden(rows, records, referenced_records(runs))
    weights: Mapping[str, float] = rows.params.severity_weight
    return list(picked), [materialise(run, records, hidden, weights) for run in runs]


def _estimated_activity(snaps: list[RunSnapshot]) -> RunActivity:
    """Edits estimated from finding changes between consecutive runs."""
    return RunActivity(_SOURCE_ESTIMATED,
                       (Counter(), *(Counter(estimate_edits(snaps[i - 1], s)) for i, s in enumerate(snaps[1:], start=1))))


def _activity(project_dir: Path, days: list[str], snaps: list[RunSnapshot]) -> RunActivity:
    """Per transition, edits per path (index 0 is empty) and where they came from: git when the project is a repo."""
    info = read_repository_info(project_dir) or {}
    if not info.get("path"):
        return _estimated_activity(snaps)
    got = git_commits_per_transition(Path(info["path"]), days) if len(days) > 1 else [Counter()]
    if got is None:
        return _estimated_activity(snaps)
    return RunActivity(_SOURCE_GIT, tuple(Counter({p: n for p, n in c.items() if p in snaps[i].files}) for i, c in enumerate(got)))


def build_map_history(reports_root: Path, project: str, *, frames: str = LATEST_FRAMES) -> MapHistory:
    """The project's map history: the latest frame, or every frame when *frames* is ``ALL_FRAMES``.

    Raises ValueError when *frames* is not one of ``FRAME_CHOICES``.
    """
    if frames not in FRAME_CHOICES:
        raise ValueError(f"unknown frames value: {frames!r}")
    if not project_dir_exists(reports_root / project):
        return EMPTY_HISTORY
    days, snaps = _history(ProjectRows.load(reports_root, project, run_limit=0))
    if not days:
        return EMPTY_HISTORY
    frame_runs = list(range(len(snaps))) if frames == ALL_FRAMES else [len(snaps) - 1]
    return assemble_history(days, snaps, _activity(reports_root / project, days, snaps), frame_runs)
