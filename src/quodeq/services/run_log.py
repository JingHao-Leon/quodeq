"""History's run log: every scored run with its metadata, comparison run and change counts.

One payload per project. Scores come from the project trend (plus cancelled
runs that scored a dimension), metadata (job id, model, commit, origin, the
planned dimensions and why the run stopped) from the provider's run listing,
and each run's change data (new/resolved counts against its baseline, files
analysed, active time) from the score cache's ``run_change`` table. Only the
change data is cached. The cache key holds the project's score-cache version,
so a dismissal, deletion or formula change misses, and the baseline id, so a
deleted baseline is replaced instead of compared against. Missing entries are
filled by :class:`RunChangeFiller`; the ones it could not finish in the
request's budget are reported ``pending``.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from quodeq.config.services_env import max_history_runs
from quodeq.core.run.run_log import LogRun, choose_baselines, summarise_diff, summarise_progress
from quodeq.core.run.origin import RunOrigin
from quodeq.core.run.state import RunState
from quodeq.core.types.job import JobSnapshot
from quodeq.services._run_log_partials import clear_partial_memo, partial_entries  # noqa: F401 - clear_partial_memo is the tests' reset
from quodeq.services._run_log_fill import (  # noqa: F401 - FAILED_CHANGE re-exported for callers and tests
    FAILED_CHANGE,
    ChangeJob,
    RunChangeFiller,
)
from quodeq.services.run_diff import diff_runs
from quodeq.services.scan_progress import ScanProgress, build_scan_progress
from quodeq.services.score_cache import score_cache_version
from quodeq.services.scoring import ProjectRows
from quodeq.services.wiring import ScoreCacheError, take_run_changes
from quodeq.services.wiring_sync import is_archived
from quodeq.shared.clock import normalise_utc_iso

# Length of the short commit hash History shows.
_SHORT_SHA = 7
# Placeholder for "no baseline" inside a cache key.
_NO_BASELINE = "-"
_NO_COUNTS: dict[str, Any] = {"counts": None, "newSev": None, "resolvedSev": None}
_NO_PROGRESS: dict[str, Any] = {"filesAnalysed": None, "activeSeconds": None}
_DETAIL_KEYS = ("dimension", "score", "grade", "majors", "critical")


class RunLister(Protocol):
    """The provider's per-project run listing (index rows merged with in-memory jobs)."""

    def list_project_evaluations(self, project: str, reports_dir: str | None = None) -> list[JobSnapshot]:
        """*project*'s runs, as snapshots."""
        ...


@dataclass(frozen=True)
class _Scored:
    """One scored run: its trend entry, whether it is a cancelled partial, its sort stamp."""

    run_id: str
    entry: dict[str, Any]
    partial: bool
    started_at: str
    dims: tuple[str, ...]


def _majors_only(row: dict[str, Any]) -> int:
    """The trend counts critical and major together; the run log's ``majors`` is majors alone."""
    return max(0, (row.get("majors") or 0) - (row.get("critical") or 0))


def _detail(row: dict[str, Any]) -> dict[str, Any]:
    return {**{k: row.get(k) for k in _DETAIL_KEYS}, "majors": _majors_only(row)}


def _status(value: object) -> str:
    return value.value if isinstance(value, RunState) else str(value)


def _scored_runs(rows: ProjectRows, meta: dict[str, JobSnapshot], version: str) -> list[_Scored]:
    """Trend entries plus scored cancelled runs, newest first, capped at the history size."""
    cap = max_history_runs()
    cancelled = [r for r in rows.runs if r.status is RunState.CANCELLED][:cap]
    partials = partial_entries(rows, cancelled, version)
    scored = [(e, False) for e in rows.trend()] + [(e, True) for e in partials]
    out = []
    for entry, partial in scored:
        run_id = entry["runId"]
        snap = meta.get(run_id)
        raw = (snap.started_at if snap else None) or entry.get("dateISO")
        dims = tuple(sorted(entry.get("dimensions") or []))
        out.append(_Scored(run_id, dict(entry), partial, normalise_utc_iso(raw) or "", dims))
    out.sort(key=lambda s: (s.started_at, s.run_id), reverse=True)
    return out[:cap]


def _project_snapshots(provider: RunLister, reports_root: Path, project: str) -> list[JobSnapshot]:
    snapshots = provider.list_project_evaluations(project, reports_dir=str(reports_root))
    return [s for s in snapshots if s.output_project == project]


def _origin(origin: RunOrigin | None) -> dict[str, Any] | None:
    """The origin's wire form, as the run listing serves it: camelCase, unset fields left out."""
    if origin is None:
        return None
    wire = {"kind": origin.kind, "event": origin.event, "workflow": origin.workflow, "ref": origin.ref,
            "pr": origin.pr, "prUrl": origin.pr_url, "runUrl": origin.run_url}
    return {k: v for k, v in wire.items() if v is not None}


def _progress_view(progress: ScanProgress) -> dict[str, Any]:
    """The fields of a progress snapshot the throughput summary reads, in wire form."""
    return {"dimensions": [{"files": d.files, "elapsedS": d.elapsed_s} for d in progress.dimensions]}


def compute_run_change(job: ChangeJob) -> dict[str, Any]:
    """One run's change data: diff counts against its baseline and its throughput."""
    out: dict[str, Any] = dict(_NO_COUNTS)
    if job.baseline_id is not None:
        diff = diff_runs(job.reports_root, job.project, job.run_id, job.baseline_id, since_baseline=False)
        out.update(summarise_diff(diff))
    try:
        # Files and time only: the finding tally would restore an archived run.
        progress = build_scan_progress(job.run_id, job.reports_root / job.project / job.run_id, tally_findings=False)
    except (OSError, ValueError):
        progress = None
    out.update(summarise_progress(_progress_view(progress)) if progress is not None else _NO_PROGRESS)
    return out


def _cache_key(version: str, baseline: tuple[str, str] | None, scored: _Scored) -> str:
    """Version, baseline, status and scored dimensions: a running run re-keys
    when a dimension lands or it finishes, a settled one only on a real change."""
    status = _status(scored.entry.get("status"))
    return f"{version}|{baseline[0] if baseline else _NO_BASELINE}|{status}|{','.join(scored.dims)}"


def _changes(
    rows: ProjectRows, scored: list[_Scored],
    baselines: dict[str, tuple[str, str] | None], filler: RunChangeFiller, version: str,
) -> dict[str, dict[str, Any]]:
    """Every run's change data found in the cache or computed now, by run id."""
    keys = {s.run_id: _cache_key(version, baselines[s.run_id], s) for s in scored}
    try:
        cached = take_run_changes(rows.project, keys)
    except ScoreCacheError:
        # Disposable cache: an unopenable one (locked, unwritable dir) means
        # everything is recomputed, never a failed request.
        cached = {}
    todo = [
        ChangeJob(rows.reports_root, rows.project, run_id, (baselines[run_id] or (None,))[0], key)
        for run_id, key in keys.items() if run_id not in cached
    ]
    cached.update(filler.fill(todo, compute_run_change))
    return cached


def _planned_dims(snap: JobSnapshot) -> list[str] | None:
    """The dimensions the run set out to evaluate, sorted; None when the run did not record them."""
    return sorted(snap.dimensions) if snap.dimensions else None


def _meta_fields(snap: JobSnapshot | None) -> dict[str, Any]:
    """The run's metadata from the provider's listing, read fresh on every request (never cached)."""
    if snap is None:
        return {"jobId": None, "endedAt": None, "model": None, "provider": None, "commit": None, "origin": None,
                "plannedDims": None, "exitReason": None}
    return {
        "jobId": snap.job_id, "endedAt": snap.ended_at, "model": snap.ai_model, "provider": snap.ai_provider,
        "commit": snap.commit_sha[:_SHORT_SHA] if snap.commit_sha else None,
        "origin": _origin(snap.origin),
        "plannedDims": _planned_dims(snap), "exitReason": snap.exit_reason or None,
    }


def _entry(
    scored: _Scored, snap: JobSnapshot | None, baseline: tuple[str, str] | None,
    change: dict[str, Any] | None, archived: bool,
) -> dict[str, Any]:
    e = scored.entry
    data = change or {}
    return {
        "runId": scored.run_id,
        "startedAt": (snap.started_at if snap else None) or e.get("dateISO"),
        "status": _status(e.get("status")),
        **_meta_fields(snap),
        "dims": list(scored.dims),
        "partial": scored.partial,
        "score": e.get("runNumericAverage"), "grade": e.get("runOverallGrade"),
        "open": e.get("violations"), "critical": e.get("critical"), "majors": _majors_only(e),
        "dimensionDetails": [_detail(d) for d in e.get("dimensionDetails") or []],
        "filesAnalysed": data.get("filesAnalysed"), "activeSeconds": data.get("activeSeconds"),
        "baselineRunId": baseline[0] if baseline else None,
        "baselineKind": baseline[1] if baseline else None,
        "counts": data.get("counts") if baseline else None,
        "newSev": data.get("newSev") if baseline else None,
        "resolvedSev": data.get("resolvedSev") if baseline else None,
        "pending": change is None,
        "archived": archived,
    }


def _running(snapshots: list[JobSnapshot]) -> dict[str, Any] | None:
    running = sorted((s for s in snapshots if s.status == RunState.RUNNING.value),
                     key=lambda s: normalise_utc_iso(s.started_at) or "", reverse=True)
    if not running:
        return None
    s = running[0]
    return {
        "jobId": s.job_id, "startedAt": s.started_at, "model": s.ai_model,
        "origin": _origin(s.origin), "currentDimension": s.current_dimension,
    }


def build_run_log(
    reports_root: Path, project: str, *, provider: RunLister, filler: RunChangeFiller,
) -> dict[str, Any]:
    """The run log payload: ``{"runs": [...newest first], "running": {...} | None}``."""
    rows = ProjectRows.load(reports_root, project)
    if not rows.runs:
        return {"runs": [], "running": None}
    snapshots = _project_snapshots(provider, reports_root, project)
    meta = {s.output_run_id: s for s in snapshots if s.output_run_id}
    version = score_cache_version(rows.reports_root / rows.project, rows.params)
    scored = _scored_runs(rows, meta, version)
    baselines = choose_baselines([
        LogRun(s.run_id, s.started_at, getattr(meta.get(s.run_id), "ai_model", None), s.dims) for s in scored
    ])
    changes = _changes(rows, scored, baselines, filler, version)
    project_dir = rows.reports_root / rows.project
    return {
        "runs": [
            _entry(s, meta.get(s.run_id), baselines[s.run_id], changes.get(s.run_id), is_archived(project_dir / s.run_id))
            for s in scored
        ],
        "running": _running(snapshots),
    }
