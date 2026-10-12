"""The map's history payload: per-run file stats, functional areas, activity and
area kinds. Each run's snapshot is cached in the score cache's ``map_snapshot``
table under the project's score-cache version (a dismissal re-keys)."""
from __future__ import annotations

import sqlite3
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

from quodeq.core.run.state import RunState
from quodeq.core.map_history.activity import estimate_edits, first_seen_index
from quodeq.core.map_history.area_metrics import area_metrics_per_run
from quodeq.core.map_history.areas import assign_areas
from quodeq.core.map_history.snapshot import RunSnapshot, build_run_snapshot
from quodeq.services._map_git import git_commits_per_transition
from quodeq.services.score_cache import score_cache_version
from quodeq.services.scoring import ProjectRows
from quodeq.services.wiring import (
    eval_report_dimensions,
    iter_readable_eval_reports,
    load_map_snapshots,
    open_score_cache,
    prune_map_snapshots,
    read_repository_info,
    store_map_snapshot,
)

# Finding identity verdict marker for a violation, and the ``frames`` value that asks for every frame.
_VIOLATION = "v"
_ALL_FRAMES = "all"
# Snapshot payload shape: bump to invalidate every cached snapshot.
SNAPSHOT_SHAPE = "1"
# The leading characters of an ISO timestamp that make up its calendar day.
_ISO_DAY_LEN = 10
_EMPTY: dict[str, Any] = {"activitySource": "none", "days": [], "fileNames": [], "fileArea": [], "fileTest": [], "frames": []}


def _valid_day(day: str) -> bool:
    """True when *day* is an ISO calendar date; runs without one cannot be placed on the timeline."""
    try:
        date.fromisoformat(day)
    except ValueError:
        return False
    return True


# A history candidate: (day, run_id, report dimensions, parsed reports or None until read).
_Candidate = tuple[str, str, list[str], "list[tuple[str, dict]] | None"]


def _readable_reports(run_dir: Path) -> list[tuple[str, dict]]:
    """``(dimension, report)`` for each readable report object of *run_dir*."""
    return [(dim, data) for dim, data in iter_readable_eval_reports(run_dir) if isinstance(data, dict)]


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
        reports = None
        day = (run.date_iso or "")[:_ISO_DAY_LEN]
        if not run.date_iso:
            reports = _readable_reports(run_dir)
            if not reports:
                continue
            dims = sorted(dim for dim, _ in reports)
            day = max(str(d.get("date") or "")[:_ISO_DAY_LEN] for _, d in reports)
        if _valid_day(day):
            out.append((day, run.run_id, dims, reports))
    return out


def _full_by_day(candidates: list[_Candidate]) -> tuple[dict[str, list[_Candidate]], int]:
    """Full-run candidates grouped by day (days ascending, each day in run order) and the dimension count a full run needs."""
    usual = Counter(len(c[2]) for c in candidates).most_common(1)[0][0]
    need = max(1, usual - 1)
    by_day: dict[str, list[_Candidate]] = {}
    for c in sorted((c for c in candidates if len(c[2]) >= need), key=lambda c: c[0]):
        by_day.setdefault(c[0], []).append(c)
    return by_day, need


def _cached_snapshots(project: str, keys: dict[str, str]) -> dict[str, RunSnapshot]:
    """The usable cached snapshots of *keys*' runs; {} when the cache is unavailable."""
    try:
        with open_score_cache() as conn:
            payloads = load_map_snapshots(conn, project, keys)
    except (sqlite3.Error, OSError):
        return {}
    return {run_id: snap for run_id, payload in payloads.items() if (snap := _from_cache(payload)) is not None}


def _store_snapshots(project: str, keys: dict[str, str], fresh: dict[str, RunSnapshot]) -> None:
    """Keep the cache to *keys*' runs and store the *fresh* snapshots among them (best-effort)."""
    try:
        with open_score_cache() as conn:
            prune_map_snapshots(conn, project, set(keys))
            for run_id, snap in fresh.items():
                if run_id in keys:
                    store_map_snapshot(conn, project, run_id, keys[run_id], snap.to_json())
    except (sqlite3.Error, OSError):
        return  # the cache is only an accelerator


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
    version = score_cache_version(rows.reports_root / rows.project, rows.params)
    finished = {r.run_id for r in rows.runs if r.status == RunState.DONE}
    keys = {run_id: f"{SNAPSHOT_SHAPE}|{version}|{','.join(dims)}"
            for group in by_day.values() for _, run_id, dims, _ in group if run_id in finished}
    cached = _cached_snapshots(rows.project, keys)
    picked: dict[str, tuple[str, RunSnapshot]] = {}
    fresh: dict[str, RunSnapshot] = {}
    for day, group in by_day.items():
        got = _day_snapshot(rows, group, cached, need)
        if got is not None:
            run_id, snap, is_fresh = got
            picked[run_id] = (day, snap)
            if is_fresh:
                fresh[run_id] = snap
    _store_snapshots(rows.project, {run_id: key for run_id, key in keys.items() if run_id in picked}, fresh)
    return [day for day, _ in picked.values()], [snap for _, snap in picked.values()]


def _day_snapshot(rows: ProjectRows, group: list[_Candidate], cached: dict[str, RunSnapshot],
                  need: int) -> tuple[str, RunSnapshot, bool] | None:
    """``(run_id, snapshot, built now)`` of the day's last run that is cached or reads as full, else None."""
    for _, run_id, _, reports in reversed(group):
        if run_id in cached:
            return run_id, cached[run_id], False
        if reports is None:
            reports = _readable_reports(rows.reports_root / rows.project / run_id)
        if len(reports) >= need:
            return run_id, build_run_snapshot(reports, rows.keys.dismissed), True
    return None


def _from_cache(payload: dict | None) -> RunSnapshot | None:
    """The snapshot of a cached *payload*, or None when absent or unreadable."""
    if payload is None:
        return None
    try:
        return RunSnapshot.from_json(payload)
    except (KeyError, ValueError, TypeError):
        return None


def _violation_ids(snap: RunSnapshot) -> set[str]:
    """Every violation identity in *snap* (compliance judgments excluded)."""
    return {f for s in snap.files.values() for f in s.ids if f.split(":")[1] == _VIOLATION}


def _activity(project_dir: Path, days: list[str], snaps: list[RunSnapshot]) -> tuple[str, list[Counter]]:
    """Per transition, edits per path (index 0 is empty) and where they came from."""
    info = read_repository_info(project_dir) or {}
    repo = Path(info["path"]) if info.get("path") else None
    if repo is not None:
        got = git_commits_per_transition(repo, days) if len(days) > 1 else [Counter()]
        if got is not None:
            return "git", [Counter({p: n for p, n in c.items() if p in snaps[i].files}) for i, c in enumerate(got)]
    return "estimated", [Counter()] + [Counter(estimate_edits(snaps[i - 1], s)) for i, s in enumerate(snaps[1:], start=1)]


def build_map_history(reports_root: Path, project: str, *, frames: str = "latest") -> dict[str, Any]:
    """The map history payload (see the plan's payload shape)."""
    if not (reports_root / project).is_dir():
        return dict(_EMPTY)
    rows = ProjectRows.load(reports_root, project, run_limit=0)
    days, snaps = _history(rows)
    if not days:
        return dict(_EMPTY)
    source, per_transition = _activity(reports_root / project, days, snaps)
    names = sorted({p for s in snaps for p in s.files})
    index = {p: i for i, p in enumerate(names)}
    assignments = assign_areas(names)
    seen = first_seen_index(snaps)
    edits_upto, ages, rows_out = [], [], []
    running: Counter = Counter()
    for k, snap in enumerate(snaps):
        running = running + per_transition[k]
        edits_upto.append(dict(running))
        today = date.fromisoformat(days[k])
        age_k = {}
        for path, stat in snap.files.items():
            starts = [seen[k][fid] for fid in stat.ids if fid.split(":")[1] == _VIOLATION and fid in seen[k]]
            age_k[path] = (today - date.fromisoformat(days[min(starts)])).days if starts else 0
        ages.append(age_k)
        rows_out.append([[index[p], round(s.weight, 2), s.violations, s.compliance, s.critical, s.major,
                          running.get(p, 0), 1 if per_transition[k].get(p) else 0, age_k[p]]
                         for p, s in snap.files.items()])
    metrics = area_metrics_per_run(snaps, assignments, edits_upto, ages)
    vids = [_violation_ids(s) for s in snaps]
    flows = [(0, 0)] + [(len(vids[i] - vids[i - 1]), len(vids[i - 1] - vids[i])) for i in range(1, len(snaps))]
    all_frames = [{"day": days[k], "new": flows[k][0], "fixed": flows[k][1], "files": rows_out[k],
                   "areas": [{"area": m.area, "files": m.files, "prodFiles": m.prod_files, "violations": m.violations,
                              "weight": m.weight, "density": m.density, "complianceRate": m.compliance_rate,
                              "touchedShare": m.touched_share, "changeRate": m.change_rate,
                              "persistentShare": m.persistent_share, "needPct": m.need_pct, "kind": m.kind,
                              "rawKind": m.raw_kind, "hasHistory": m.has_history} for m in metrics[k]]}
                  for k in range(len(snaps))]
    return {"activitySource": source, "days": days, "fileNames": names,
            "fileArea": [assignments[p].area for p in names], "fileTest": [1 if assignments[p].is_test else 0 for p in names],
            "frames": all_frames if frames == _ALL_FRAMES else all_frames[-1:]}
