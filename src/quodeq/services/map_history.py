"""The map's history payload: per-run file stats, functional areas, activity and
area kinds. Each run's snapshot is cached in the score cache's ``map_snapshot``
table under the project's score-cache version (a dismissal re-keys)."""
from __future__ import annotations

import sqlite3
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

from quodeq.core.map_history.activity import estimate_edits, first_seen_index
from quodeq.core.map_history.area_metrics import area_metrics_per_run
from quodeq.core.map_history.areas import assign_areas
from quodeq.core.map_history.snapshot import RunSnapshot, build_run_snapshot
from quodeq.services._map_git import git_commits_between
from quodeq.services.dismissed import dismissed_keys
from quodeq.services.score_cache import score_cache_version
from quodeq.services.scoring import ProjectRows
from quodeq.services.wiring import (
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
_EMPTY: dict[str, Any] = {"activitySource": "none", "days": [], "fileNames": [], "fileArea": [], "fileTest": [], "frames": []}


def _full_runs(rows: ProjectRows) -> list[tuple[str, str, list[tuple[str, object]]]]:
    """Oldest-first ``(day, run_id, reports)`` of full runs, one per day (the last of that day)."""
    candidates = []
    for run in rows.runs:
        reports = [(dim, data) for dim, data in iter_readable_eval_reports(rows.reports_root / rows.project / run.run_id)
                   if isinstance(data, dict)]
        if reports:
            day = max(str(d.get("date") or run.date_iso or "")[:10] for _, d in reports)
            candidates.append((day, run.run_id, reports))
    if not candidates:
        return []
    usual = Counter(len(r) for _, _, r in candidates).most_common(1)[0][0]
    full = sorted((c for c in candidates if len(c[2]) >= max(1, usual - 1)), key=lambda c: c[0])
    by_day: dict[str, tuple] = {}
    for c in full:
        by_day[c[0]] = c
    return list(by_day.values())


def _snapshots(rows: ProjectRows, runs: list[tuple]) -> list[RunSnapshot]:
    project_dir = rows.reports_root / rows.project
    version = score_cache_version(project_dir, rows.params)
    keys = {run_id: f"{SNAPSHOT_SHAPE}|{version}" for _, run_id, _ in runs}
    dismissed = dismissed_keys(project_dir)
    built: dict[str, RunSnapshot] = {}
    try:
        with open_score_cache() as conn:
            cached = load_map_snapshots(conn, rows.project, keys)
            prune_map_snapshots(conn, rows.project, set(keys))
            for _, run_id, reports in runs:
                if run_id in cached:
                    built[run_id] = RunSnapshot.from_json(cached[run_id])
                    continue
                built[run_id] = build_run_snapshot(reports, dismissed)
                store_map_snapshot(conn, rows.project, run_id, keys[run_id], built[run_id].to_json())
    except (sqlite3.Error, OSError):
        built.clear()  # the cache is only an accelerator: rebuild every snapshot below
    return [built[run_id] if run_id in built else build_run_snapshot(reports, dismissed)
            for _, run_id, reports in runs]


def _violation_ids(snap: RunSnapshot) -> set[str]:
    """Every violation identity in *snap* (compliance judgments excluded)."""
    return {f for s in snap.files.values() for f in s.ids if f.split(":")[1] == _VIOLATION}


def _activity(project_dir: Path, days: list[str], snaps: list[RunSnapshot]) -> tuple[str, list[Counter]]:
    """Per transition, edits per path (index 0 is empty) and where they came from."""
    info = read_repository_info(project_dir) or {}
    repo = Path(info["path"]) if info.get("path") else None
    if repo is not None:
        per = [Counter()]
        for i in range(1, len(days)):
            got = git_commits_between(repo, days[i - 1], days[i])
            if got is None:
                break
            per.append(Counter({p: n for p, n in got.items() if p in snaps[i].files}))
        else:
            return "git", per
    return "estimated", [Counter()] + [Counter(estimate_edits(snaps[i - 1], s)) for i, s in enumerate(snaps[1:], start=1)]


def build_map_history(reports_root: Path, project: str, *, frames: str = "latest") -> dict[str, Any]:
    """The map history payload (see the plan's payload shape)."""
    if not (reports_root / project).is_dir():
        return dict(_EMPTY)
    rows = ProjectRows.load(reports_root, project)
    runs = _full_runs(rows)
    if not runs:
        return dict(_EMPTY)
    days = [d for d, _, _ in runs]
    snaps = _snapshots(rows, runs)
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
    flows = [(0, 0)]
    for i in range(1, len(snaps)):
        a = _violation_ids(snaps[i - 1])
        b = _violation_ids(snaps[i])
        flows.append((len(b - a), len(a - b)))
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
