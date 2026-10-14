"""The map's history: per-day file stats, functional areas, activity and area
kinds. Each day, its runs folded, is cached raw in the score cache
(``map_snapshot`` plus the project's ``map_finding`` records); suppression and
the grade formula's severity weights apply when the history is read, so
neither ever rebuilds a cached day."""
from __future__ import annotations

from collections import Counter
from collections.abc import Mapping
from dataclasses import replace
from datetime import date
from pathlib import Path
from typing import NamedTuple

from quodeq.core.map_history.activity import estimate_edits
from quodeq.core.map_history.carry import carry_forward, fold_runs
from quodeq.core.map_history.history import EMPTY_HISTORY, MapHistory, RunActivity, assemble_history
from quodeq.core.map_history.raw_run import (
    RawHistory, RawHistoryWrite, RawRun, ViolationRecord, build_raw_run, materialise, referenced_records,
)
from quodeq.core.map_history.snapshot import RunSnapshot
from quodeq.core.map_history.timeline import ISO_DAY_LEN
from quodeq.core.finding_identity import SuppressionSubject
from quodeq.core.run.state import RunState
from quodeq.core.types import DimensionResult
from quodeq.services._accumulated_data import has_valid_score
from quodeq.services._map_git import git_commits_per_transition
from quodeq.services._run_liveness import run_still_writing
from quodeq.services._violation_filters import is_suppressed_subject, suppression_subject
from quodeq.services.scoring import ProjectRows
from quodeq.services.scoring_view import select_default_view_runs
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
# read; 4: compliance counted per dimension, so a run can carry a dimension it did not report; 5: a row is one day,
# every run of it folded oldest first).
SNAPSHOT_SHAPE = "5"
# Separators of a day's cache key: between its runs, and between a run's id and its dimensions (neither can
# appear in a run id, a validated path segment, nor in a dimension name).
_KEY_RUN_SEP = ";"
_KEY_DIMS_SEP = "="
_SOURCE_GIT = "git"
_SOURCE_ESTIMATED = "estimated"


class _Candidate(NamedTuple):
    """A run the page header counts, with the day its reports fold into on the timeline."""

    day: str
    run_id: str
    dims: list[str]                              # report dimensions
    reports: list[tuple[str, dict]] | None       # parsed reports, None until read
    cancelled: bool = False                      # a cancelled run may still drain after its state flips


class _DayRun(NamedTuple):
    """One day as its last run left it, raw, with the records read for it now (none when cached)."""

    row_id: str                          # the day's last run, the cache row the day is stored under
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


def _counted(dimension: str, report: dict) -> bool:
    """True when the page header counts *report*: it has a score and its model read files (``has_valid_score``).

    A cancelled run's stub report has neither, so the dimension keeps what an earlier run reported.
    """
    score, files_read = report.get("overallScore"), report.get("filesRead")
    return has_valid_score(DimensionResult(
        dimension, overall_score=score if isinstance(score, str) else None,
        files_read=files_read if isinstance(files_read, int) and not isinstance(files_read, bool) else None))


def _readable_reports(run_dir: Path) -> list[tuple[str, dict]]:
    """``(dimension, report)`` for each readable report object of *run_dir*."""
    return [(dim, data) for dim, data in iter_readable_eval_reports(run_dir) if isinstance(data, dict)]


def _undated_candidate(run_id: str, run_dir: Path, cancelled: bool) -> _Candidate | None:
    """A run without a date, dated by its reports' latest date; None when none is readable."""
    reports = _readable_reports(run_dir)
    if not reports:
        return None
    day = max(str(d.get("date") or "")[:ISO_DAY_LEN] for _, d in reports)
    return _Candidate(day, run_id, sorted(dim for dim, _ in reports), reports, cancelled)


def _candidates(rows: ProjectRows) -> list[_Candidate]:
    """The runs the page header counts (``select_default_view_runs``) with reports and a usable day, in ``rows.runs`` order.

    Dimensions come from the report file names and the day from the run's
    date (what History shows), so no report is read; a run without a date is
    read for its reports' latest date instead, and keeps only its readable
    dimensions.
    """
    out: list[_Candidate] = []
    for run in select_default_view_runs(rows.runs):
        run_dir = rows.reports_root / rows.project / run.run_id
        dims = eval_report_dimensions(run_dir)
        if not dims:
            continue
        cancelled = run.status is RunState.CANCELLED
        if run.date_iso:
            cand: _Candidate | None = _Candidate(run.date_iso[:ISO_DAY_LEN], run.run_id, dims, None, cancelled)
        else:
            cand = _undated_candidate(run.run_id, run_dir, cancelled)
        if cand is not None and _valid_day(cand.day):
            out.append(cand)
    return out


def _by_day(candidates: list[_Candidate]) -> dict[str, list[_Candidate]]:
    """*candidates* grouped by day, days ascending, each day's runs oldest first.

    *candidates* come newest first, as ``rows.runs`` lists them.
    """
    by_day: dict[str, list[_Candidate]] = {}
    for c in sorted(reversed(candidates), key=lambda c: c.day):
        by_day.setdefault(c.day, []).append(c)
    return by_day


def _day_key(group: list[_Candidate]) -> str:
    """The cache key of a day: the payload shape and each of its runs with its dimensions."""
    runs = _KEY_RUN_SEP.join(f"{c.run_id}{_KEY_DIMS_SEP}{','.join(c.dims)}" for c in group)
    return f"{SNAPSHOT_SHAPE}|{runs}"


def _cache_keys(rows: ProjectRows, by_day: dict[str, list[_Candidate]]) -> dict[str, str]:
    """The cache key of every day no process still writes, under the day's last run.

    The header counts only done runs, or cancelled ones, and a cancelled run
    drains after its state flips, so only a cancelled run's ``.pid`` is
    checked. Suppression and the grade formula apply when a day is read, so
    neither is part of the key; an ended run's reports are never rewritten,
    and a run added to or removed from the day changes the key.
    """
    project_dir = rows.reports_root / rows.project
    return {group[-1].run_id: _day_key(group) for group in by_day.values()
            if not any(c.cancelled and run_still_writing(project_dir, c.run_id) for c in group)}


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


def _day_run(rows: ProjectRows, group: list[_Candidate], stored: RawHistory) -> _DayRun | None:
    """The day as its last run left it: its runs (oldest first) folded, each dimension as last reported that day.

    Only reports the page header counts are folded (``_counted``), and only
    the records the folded day refers to are kept. None when the day has none.
    """
    row_id = group[-1].run_id
    if row_id in stored.runs:
        return _DayRun(row_id, stored.runs[row_id], {}, False)
    runs: list[RawRun] = []
    records: dict[str, ViolationRecord] = {}
    for c in group:
        reports = c.reports if c.reports is not None else _readable_reports(rows.reports_root / rows.project / c.run_id)
        built = build_raw_run([(dim, report) for dim, report in reports if _counted(dim, report)], _subject_of)
        runs.append(built.run)
        records.update(built.records)
    if not any(run.dims for run in runs):
        return None
    day = fold_runs(runs, records)
    return _DayRun(row_id, day, {k: records[k] for k in referenced_records([day])}, True)


def _save(rows: ProjectRows, picked: dict[str, _DayRun], keys: dict[str, str]) -> None:
    """Store the fresh cacheable days and their records; keep only what the cacheable days use."""
    kept = [p for p in picked.values() if p.row_id in keys]
    fresh = [p for p in kept if p.built_now]
    save_map_snapshots(rows.project, RawHistoryWrite(
        runs={p.row_id: (keys[p.row_id], p.run) for p in fresh},
        records={k: r for p in fresh for k, r in p.records.items()},
        keep_runs={p.row_id for p in kept},
        keep_records=referenced_records(p.run for p in kept),
    ))


def _days(rows: ProjectRows) -> tuple[dict[str, _DayRun], dict[str, ViolationRecord]]:
    """Each day with a counted report (oldest first) and the records the days refer to.

    Days are read from the cache where it holds them, and the fresh ones are
    stored; reports are read only for days it does not hold.
    """
    candidates = _candidates(rows)
    if not candidates:
        return {}, {}
    by_day = _by_day(candidates)
    keys = _cache_keys(rows, by_day)
    stored = load_map_snapshots(rows.project, keys)
    picked = {day: got for day, group in by_day.items()
              if (got := _day_run(rows, group, stored)) is not None}
    _save(rows, picked, keys)
    return picked, {**stored.records, **{k: r for p in picked.values() for k, r in p.records.items()}}


def _history(rows: ProjectRows) -> tuple[list[str], list[RunSnapshot], list[str]]:
    """Oldest-first days with reports, their snapshots (the accumulated view as of each day's end) and each day's last run.

    Every run the page header counts counts here: a day folds its runs oldest
    first, and a dimension the day did not report is carried from the latest
    earlier day that did.
    """
    picked, records = _days(rows)
    runs = carry_forward([p.run for p in picked.values()], records)
    hidden = _hidden(rows, records, referenced_records(runs))
    weights: Mapping[str, float] = rows.params.severity_weight
    return list(picked), [materialise(run, records, hidden, weights) for run in runs], [p.row_id for p in picked.values()]


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
    days, snaps, day_runs = _history(ProjectRows.load(reports_root, project, run_limit=0))
    if not days:
        return EMPTY_HISTORY
    frame_runs = list(range(len(snaps))) if frames == ALL_FRAMES else [len(snaps) - 1]
    history = assemble_history(days, snaps, _activity(reports_root / project, days, snaps), frame_runs)
    return replace(history, day_runs=tuple(day_runs))
