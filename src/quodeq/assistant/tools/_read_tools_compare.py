"""Project-to-project comparison tool: the Compare tab's fleet view, trimmed
to each project's scores, grades, severities and freshness."""
from __future__ import annotations

from quodeq.assistant.tools._constants import JSON_SCHEMA_TYPE_OBJECT, JSON_SCHEMA_TYPE_STRING
from quodeq.assistant.tools._context import ToolContext
from quodeq.assistant.tools._read_tools_scope import project_location
from quodeq.assistant.tools._read_tools_violations import visible_only
from quodeq.assistant.tools.registry import ToolError, ToolRegistry, ToolSpec
from quodeq.core.utils.io import validate_path_segment
from quodeq.services.compare import build_fleet_compare
from quodeq.services.fs_projects import collect_candidate_dirs

_MAX_PROJECTS = 10
# Project names offered back when a requested one is unknown.
_MAX_LISTED_PROJECTS = 50
_HIDDEN_SUMMARY_NOTE = (
    "project score, grade and violation totals omitted for projects whose "
    "accumulated summary covers standards hidden from the dashboard. Quote "
    "the per-dimension scores instead.")


def _trim_summary(ctx: ToolContext, summary: dict) -> tuple[dict, list[str]]:
    dims, hidden = visible_only(ctx, summary.get("dimensions") or [])
    out = {
        "project": summary.get("project"),
        "dimensions": [{"dimension": d.get("dimension"), "score": d.get("overallScore"),
                        "grade": d.get("overallGrade")} for d in dims],
        "runsCount": summary.get("runsCount"), "lastRun": summary.get("lastRun"),
        "commitsSinceLastRun": summary.get("commitsSinceLastRun"),
    }
    if not hidden:
        head = summary.get("summary") or {}
        out.update({"score": head.get("numericAverage"), "grade": head.get("overallGrade"),
                    "violations": head.get("totalViolations"), "severity": head.get("severity")})
    return out, hidden


def _project_names(projects: list | None, current: str) -> list[str]:
    names = list(dict.fromkeys(str(p) for p in (projects or []))) or [current]
    if len(names) > _MAX_PROJECTS:
        raise ToolError(f"compare at most {_MAX_PROJECTS} projects at a time")
    for name in names:
        try:
            validate_path_segment(name)
        except ValueError as exc:
            raise ToolError(f"invalid project id: {name!r}") from exc
    return names


def compare_projects(ctx: ToolContext, projects: list[str] | None = None) -> dict:
    """Side-by-side accumulated scores of *projects* (default: the current one)."""
    reports_root, current = project_location(ctx)
    names = _project_names(projects, current)
    result = build_fleet_compare(reports_root, names)
    rows: list[dict] = []
    hidden_all: set[str] = set()
    for summary in result.get("summaries") or []:
        row, hidden = _trim_summary(ctx, summary)
        rows.append(row)
        hidden_all.update(hidden)
    errors = dict(result.get("errors") or {})
    for name in names:
        if name not in {r["project"] for r in rows} and name not in errors:
            errors[name] = "unknown project"
    out = {"projects": rows, "errors": errors, "hiddenStandardIds": sorted(hidden_all)}
    if errors:
        out["availableProjects"] = collect_candidate_dirs(reports_root, _MAX_LISTED_PROJECTS)
    if hidden_all:
        out["note"] = _HIDDEN_SUMMARY_NOTE
    return out


def register_compare_tools(registry: ToolRegistry, ctx: ToolContext) -> None:
    registry.register(ToolSpec(
        "compare_projects",
        "Side-by-side accumulated results of projects in this evaluations "
        "directory (the Compare tab and its duel): per project the score, "
        "grade, violations by severity, per-dimension score and grade, run "
        "count, last run and commits since it. `projects` are project ids as "
        "get_context and the Repositories tab name them; include the current "
        "one to compare against it, omit the argument for the current project "
        "alone. Unknown ids come back in `errors` with `availableProjects`.",
        {"type": JSON_SCHEMA_TYPE_OBJECT, "properties": {
            "projects": {"type": "array", "items": {"type": JSON_SCHEMA_TYPE_STRING}, "maxItems": _MAX_PROJECTS},
        }},
        lambda **kw: compare_projects(ctx, **kw)))
