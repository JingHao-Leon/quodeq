"""Score history and run-to-run diff tools: what the History tab, the
Overview's score history chart and the "since the previous period" lines
show, trimmed to what a chat answer needs.
"""
from __future__ import annotations

from pathlib import Path

from quodeq.assistant.tools._constants import JSON_SCHEMA_TYPE_OBJECT, JSON_SCHEMA_TYPE_STRING
from quodeq.assistant.tools._context import ToolContext
from quodeq.assistant.tools._read_tools_common import validate_dimension
from quodeq.assistant.tools._read_tools_scope import has_run, project_location
from quodeq.assistant.tools._read_tools_violations import trim_violation, visible_only
from quodeq.assistant.tools.registry import ToolError, ToolRegistry, ToolSpec
from quodeq.core.standards.visibility import partition_visible
from quodeq.core.utils.io import validate_path_segment
from quodeq.core.utils.numbers import clamp
from quodeq.services.run_diff import diff_runs
from quodeq.services.scoring import ProjectRows
from quodeq.services.wiring import list_runs

_HISTORY_DEFAULT_LIMIT = 12
HISTORY_MAX_LIMIT = 50
# Finding lists per dimension in compare_runs; the counts stay complete.
_DIFF_LIST_CAP = 20
_RUN_FIELDS = ("runId", "dateLabel", "status", "violations", "majors", "critical", "openTypes")
# Model-facing name -> trend entry key, for the scores a run carries.
_RUN_SCORE_FIELDS = {
    "score": "runNumericAverage", "grade": "runOverallGrade",
    "accumulatedScore": "numericAverage", "accumulatedGrade": "overallGrade",
}
_DETAIL_FIELDS = ("dimension", "score", "grade", "delta", "violations", "majors", "critical")
_HIDDEN_SCORES_NOTE = (
    "run and accumulated scores omitted: they cover every standard, including "
    "the ones hidden from this project's dashboard. Quote the per-dimension "
    "scores instead.")


def _trend(reports_root: Path, project: str) -> list[dict]:
    try:
        return ProjectRows.load(reports_root, project).trend()
    except (OSError, ValueError, KeyError) as exc:
        raise ToolError(f"could not read the score history of project {project}: {exc}") from exc


def _trim_run(entry: dict, details: list[dict], with_scores: bool) -> dict:
    out = {k: entry.get(k) for k in _RUN_FIELDS}
    if with_scores:
        out.update({name: entry.get(key) for name, key in _RUN_SCORE_FIELDS.items()})
    out["dimensions"] = [{k: d.get(k) for k in _DETAIL_FIELDS} for d in details]
    return out


def get_history(ctx: ToolContext, dimension: str | None = None,
                limit: int = _HISTORY_DEFAULT_LIMIT) -> dict:
    """Newest-first scored runs with their per-dimension scores and deltas.

    With *dimension* only the runs that scored it are returned, each with
    that dimension alone, which is the dimension page's score history.
    """
    limit = clamp(int(limit), 1, HISTORY_MAX_LIMIT)
    if dimension:
        validate_dimension(dimension)
    reports_root, project = project_location(ctx)
    hidden_all: set[str] = set()
    runs: list[dict] = []
    per_entry: list[tuple[dict, list[dict]]] = []
    for entry in _trend(reports_root, project):
        details, hidden = visible_only(ctx, entry.get("dimensionDetails") or [])
        hidden_all.update(hidden)
        if dimension:
            details = [d for d in entry.get("dimensionDetails") or []
                       if d.get("dimension") == dimension]
            if not details:
                continue
        per_entry.append((entry, details))
    for entry, details in per_entry[:limit]:
        runs.append(_trim_run(entry, details, with_scores=not hidden_all))
    out = {"project": project, "dimension": dimension, "count": len(runs), "runs": runs,
           "hiddenStandardIds": [] if dimension else sorted(hidden_all)}
    if hidden_all:
        out["note"] = _HIDDEN_SCORES_NOTE
    return out


def _validate_run_id(run_id: str, label: str) -> str:
    try:
        validate_path_segment(str(run_id))
    except ValueError as exc:
        raise ToolError(f"invalid {label}: {run_id!r}") from exc
    return str(run_id)


def _default_run_id(ctx: ToolContext, reports_root: Path, project: str) -> str:
    if has_run(ctx):
        return ctx.run_dir.name
    runs = list_runs(reports_root, project, limit=1)
    if not runs:
        raise ToolError(f"project {project} has no runs to compare")
    return runs[0].run_id


def _trim_since_baseline(scoped: dict) -> dict:
    types = scoped.get("types") or {}
    files = scoped.get("changedFiles")
    return {
        "scope": scoped.get("scope"),
        "changedFiles": files if isinstance(files, int) else len(files or []),
        "counts": scoped.get("counts"),
        "majorsDelta": scoped.get("majorsDelta"), "criticalDelta": scoped.get("criticalDelta"),
        "typesOpened": types.get("opened"), "typesClosed": types.get("closed"),
    }


def _trim_dimension_diff(entry: dict) -> dict:
    types = entry.get("types") or {}
    out = {
        "againstRunId": entry.get("againstRunId"),
        "counts": entry.get("counts"),
        "majorsDelta": entry.get("majorsDelta"), "criticalDelta": entry.get("criticalDelta"),
        "typesOpened": types.get("opened"), "typesClosed": types.get("closed"),
        "new": [trim_violation(f) for f in (entry.get("new") or [])[:_DIFF_LIST_CAP]],
        "resolved": [trim_violation(f) for f in (entry.get("resolved") or [])[:_DIFF_LIST_CAP]],
    }
    since = entry.get("sinceBaseline")
    if since:
        out["sinceBaseline"] = _trim_since_baseline(since)
    return out


def compare_runs(ctx: ToolContext, run_id: str | None = None,
                 against: str | None = None) -> dict:
    """Finding-level diff of *run_id* (default: the selected or newest run)
    against *against* (default: each dimension's previous scoring run)."""
    reports_root, project = project_location(ctx)
    run = _validate_run_id(run_id, "run_id") if run_id else _default_run_id(ctx, reports_root, project)
    base = _validate_run_id(against, "against") if against else None
    try:
        diff = diff_runs(reports_root, project, run, base)
    except FileNotFoundError as exc:
        raise ToolError(f"run not found in project {project}: {exc}") from exc
    except (OSError, ValueError, KeyError) as exc:
        raise ToolError(f"could not diff run {run}: {exc}") from exc
    dims = diff.get("dimensions") or {}
    shown, hidden = partition_visible(list(dims), ctx.visible_standard_ids)
    return {
        "project": project, "runId": diff.get("runId"), "againstRunId": diff.get("againstRunId"),
        "dimensions": {name: _trim_dimension_diff(dims[name]) for name in shown},
        "hiddenStandardIds": sorted({h.lower() for h in hidden}),
    }


def register_history_tools(registry: ToolRegistry, ctx: ToolContext) -> None:
    registry.register(ToolSpec(
        "get_history",
        "Score history, newest run first: each scored run's own score and "
        "grade, the accumulated score as of that run, its violation, major, "
        "critical and open-type totals, and per dimension the score, grade and "
        "delta against that dimension's previous run. `dimension` narrows to "
        "one dimension's trend (the dimension page's score history). Use it for "
        "'how did this evolve', 'when did the score drop', the History tab and "
        "the Overview's score history chart.",
        {"type": JSON_SCHEMA_TYPE_OBJECT, "properties": {
            "dimension": {"type": JSON_SCHEMA_TYPE_STRING},
            "limit": {"type": "integer", "minimum": 1, "maximum": HISTORY_MAX_LIMIT},
        }},
        lambda **kw: get_history(ctx, **kw)))
    registry.register(ToolSpec(
        "compare_runs",
        "Finding-level diff of one run against a baseline, per dimension: new, "
        "resolved and moved counts with severity tallies, majors and critical "
        "deltas, requirement types opened and closed, the first new and "
        "resolved findings, and the same diff restricted to the files git "
        "changed (sinceBaseline). `run_id` defaults to the selected run or the "
        "newest one; `against` defaults to each dimension's previous scoring "
        "run. Use it for 'what changed since', 'what is new in this run' and "
        "the 'since the previous period' lines.",
        {"type": JSON_SCHEMA_TYPE_OBJECT, "properties": {
            "run_id": {"type": JSON_SCHEMA_TYPE_STRING},
            "against": {"type": JSON_SCHEMA_TYPE_STRING},
        }},
        lambda **kw: compare_runs(ctx, **kw)))
