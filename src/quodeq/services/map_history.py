"""The map's history: per-run file stats, functional areas, activity and area
kinds. Each run's snapshot is cached in the score cache's ``map_snapshot``
table under the project's score-cache version (a dismissal or a grade-formula
change re-keys)."""
from __future__ import annotations

from collections import Counter
from collections.abc import Mapping
from datetime import date
from pathlib import Path
from typing import NamedTuple

from quodeq.core.map_history.activity import estimate_edits
from quodeq.core.map_history.history import EMPTY_HISTORY, MapHistory, RunActivity, assemble_history
from quodeq.core.map_history.snapshot import RunSnapshot, build_run_snapshot
from quodeq.core.map_history.timeline import ISO_DAY_LEN
from quodeq.core.run.state import RunState
from quodeq.services._map_git import git_commits_per_transition
from quodeq.services.score_cache import score_cache_version
from quodeq.services.scoring import ProjectRows
from quodeq.services.wiring import (
    eval_report_dimensions,
    iter_readable_eval_reports,
    load_map_snapshot_payloads,
    read_repository_info,
    save_map_snapshot_payloads,
)

# The ``frames`` value that asks for every frame (anything else gives the latest only).
_ALL_FRAMES = "all"
# Snapshot payload shape: bump to invalidate every cached snapshot.
SNAPSHOT_SHAPE = "1"
_SOURCE_GIT = "git"
_SOURCE_ESTIMATED = "estimated"


class _Candidate(NamedTuple):
    """A run that may stand for its day on the timeline."""

    day: str
    run_id: str
    dims: list[str]                              # report dimensions
    reports: list[tuple[str, dict]] | None       # parsed reports, None until read


class _DaySnapshot(NamedTuple):
    """The run picked for one day and its snapshot."""

    run_id: str
    snapshot: RunSnapshot
    built_now: bool     # False when it came from the cache


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
    usual = Counter(len(c.dims) for c in candidates).most_common(1)[0][0]
    need = max(1, usual - 1)
    by_day: dict[str, list[_Candidate]] = {}
    for c in sorted((c for c in candidates if len(c.dims) >= need), key=lambda c: c.day):
        by_day.setdefault(c.day, []).append(c)
    return by_day, need


def _from_cache(payload: dict) -> RunSnapshot | None:
    """The snapshot of a cached *payload*, or None when it is unreadable (the run is rebuilt)."""
    try:
        return RunSnapshot.from_json(payload)
    except (KeyError, ValueError, TypeError):
        return None


def _cached_snapshots(project: str, keys: dict[str, str]) -> dict[str, RunSnapshot]:
    """The usable cached snapshots of *keys*' runs."""
    payloads = load_map_snapshot_payloads(project, keys)
    return {run_id: snap for run_id, payload in payloads.items() if (snap := _from_cache(payload)) is not None}


def _cache_keys(rows: ProjectRows, by_day: dict[str, list[_Candidate]]) -> dict[str, str]:
    """The snapshot cache key of every finished candidate run.

    The score-cache version covers dismissals and the grade formula (its
    severity weights included), so either change re-keys every snapshot.
    """
    version = score_cache_version(rows.reports_root / rows.project, rows.params)
    finished = {r.run_id for r in rows.runs if r.status == RunState.DONE}
    return {c.run_id: f"{SNAPSHOT_SHAPE}|{version}|{','.join(c.dims)}"
            for group in by_day.values() for c in group if c.run_id in finished}


def _day_snapshot(rows: ProjectRows, group: list[_Candidate], cached: dict[str, RunSnapshot],
                  need: int) -> _DaySnapshot | None:
    """The day's last run that is cached or reads as full, else None.

    *group* is newest first: an earlier run of the day stands in only when
    every later one is uncached and reads short of a full run.
    """
    weights: Mapping[str, float] = rows.params.severity_weight
    for c in group:
        if c.run_id in cached:
            return _DaySnapshot(c.run_id, cached[c.run_id], False)
        reports = c.reports if c.reports is not None else _readable_reports(rows.reports_root / rows.project / c.run_id)
        if len(reports) >= need:
            return _DaySnapshot(c.run_id, build_run_snapshot(reports, rows.keys.dismissed, weights), True)
    return None


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
    cached = _cached_snapshots(rows.project, keys)
    picked = {day: got for day, group in by_day.items() if (got := _day_snapshot(rows, group, cached, need)) is not None}
    kept = {p.run_id for p in picked.values() if p.run_id in keys}
    fresh = {p.run_id: (keys[p.run_id], p.snapshot.to_json()) for p in picked.values() if p.built_now and p.run_id in keys}
    save_map_snapshot_payloads(rows.project, fresh, kept)
    return list(picked), [p.snapshot for p in picked.values()]


def _estimated_activity(snaps: list[RunSnapshot]) -> RunActivity:
    """Edits estimated from finding changes between consecutive runs."""
    return RunActivity(_SOURCE_ESTIMATED,
                       [Counter()] + [Counter(estimate_edits(snaps[i - 1], s)) for i, s in enumerate(snaps[1:], start=1)])


def _activity(project_dir: Path, days: list[str], snaps: list[RunSnapshot]) -> RunActivity:
    """Per transition, edits per path (index 0 is empty) and where they came from: git when the project is a repo."""
    info = read_repository_info(project_dir) or {}
    if not info.get("path"):
        return _estimated_activity(snaps)
    got = git_commits_per_transition(Path(info["path"]), days) if len(days) > 1 else [Counter()]
    if got is None:
        return _estimated_activity(snaps)
    return RunActivity(_SOURCE_GIT, [Counter({p: n for p, n in c.items() if p in snaps[i].files}) for i, c in enumerate(got)])


def build_map_history(reports_root: Path, project: str, *, frames: str = "latest") -> MapHistory:
    """The project's map history: the latest frame, or every frame when *frames* is ``"all"``."""
    if not (reports_root / project).is_dir():
        return EMPTY_HISTORY
    days, snaps = _history(ProjectRows.load(reports_root, project, run_limit=0))
    if not days:
        return EMPTY_HISTORY
    frame_runs = list(range(len(snaps))) if frames == _ALL_FRAMES else [len(snaps) - 1]
    return assemble_history(days, snaps, _activity(reports_root / project, days, snaps), frame_runs)
