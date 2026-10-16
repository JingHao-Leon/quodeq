"""Map and principle-history reads: the Risk areas the Overview's Fix first and the Risk tab rank,
and one dimension's per-principle score series."""
from __future__ import annotations

from collections import defaultdict

from quodeq.assistant.tools._constants import JSON_SCHEMA_TYPE_OBJECT, JSON_SCHEMA_TYPE_STRING
from quodeq.assistant.tools._context import ToolContext
from quodeq.assistant.tools._read_tools_common import validate_dimension
from quodeq.assistant.tools._read_tools_scope import project_location
from quodeq.assistant.tools.registry import ToolError, ToolRegistry, ToolSpec
from quodeq.core.map_history.area_metrics import FLOOR_DORMANT, FLOOR_HOTSPOT, AreaKind
from quodeq.core.utils.numbers import clamp
from quodeq.services.map_history import build_map_history
from quodeq.services.principle_series import UnknownDimension, build_principle_series

_AREAS_DEFAULT, _AREAS_MAX = 10, 50
_MOST_EDITED = 5
_FIX_FIRST, _WATCH, _HEALTHY = "fix_first", "watch", "healthy"
_ZONE_ORDER = {_FIX_FIRST: 0, _WATCH: 1, _HEALTHY: 2}
_NO_ZONE = len(_ZONE_ORDER)


def _zone(area) -> str | None:
    """The Risk sky's zone (models/riskRules.js zoneOf): None when the area is too small to judge."""
    if area.kind == AreaKind.SMALL:
        return None
    if area.density >= FLOOR_HOTSPOT:
        return _FIX_FIRST
    return _WATCH if area.density >= FLOOR_DORMANT else _HEALTHY


def _files_by_area(history, frame) -> dict[str, list]:
    out: dict[str, list] = defaultdict(list)
    for row in frame.files:
        out[history.file_area[row.file]].append(row)
    return out


def _area_row(area, rows: list, names: tuple[str, ...]) -> dict:
    critical = sum(r.critical for r in rows)
    major = sum(r.major for r in rows)
    edited = sorted((r for r in rows if r.edits), key=lambda r: (-r.edits, names[r.file]))[:_MOST_EDITED]
    return {
        "name": area.area, "zone": _zone(area), "density": area.density, "files": area.files,
        "productionFiles": area.prod_files, "violations": area.violations,
        "severities": {"critical": critical, "major": major, "minor": area.violations - critical - major},
        "complianceRate": area.compliance_rate, "touchedShare": area.touched_share,
        "mostEdited": [{"file": names[r.file], "edits": r.edits} for r in edited],
    }


def _get_risk_areas(ctx: ToolContext, limit: int = _AREAS_DEFAULT) -> dict:
    reports_root, project = project_location(ctx)
    # A shared session's recorded repo path was written by someone else: never run git on it.
    history = build_map_history(reports_root, project, git_activity=not ctx.read_only)
    if not history.frames:
        return {"areas": [], "activitySource": history.activity_source, "day": None}
    frame = history.frames[-1]
    by_area = _files_by_area(history, frame)
    rows = [_area_row(a, by_area.get(a.area, []), history.file_names) for a in frame.areas]
    rows.sort(key=lambda r: (_ZONE_ORDER.get(r["zone"], _NO_ZONE), -r["density"], r["name"]))
    limit = clamp(int(limit), 1, _AREAS_MAX)
    return {"areas": rows[:limit], "total": len(rows), "activitySource": history.activity_source, "day": frame.day}


def _get_principle_history(ctx: ToolContext, dimension: str) -> dict:
    validate_dimension(dimension)
    reports_root, project = project_location(ctx)
    try:
        series = build_principle_series(reports_root, project, dimension)
    except UnknownDimension as exc:
        raise ToolError(f"no run scored {dimension}") from exc
    return {"dimension": series.dimension, "runs": [
        {"runId": run.run_id, "date": run.date_iso, "principles": [
            {"principle": p.principle, "score": p.score, "grade": p.grade} for p in run.principles]}
        for run in series.runs]}


def register_map_tools(registry: ToolRegistry, ctx: ToolContext) -> None:
    registry.register(ToolSpec(
        "get_risk_areas",
        "The project's functional areas worst first, as the Overview's Fix first and the Map's Risk "
        "tab rank them: zone (fix_first, watch, healthy; null when too small to judge), weighted "
        "findings per production file (density), findings per severity, the share of files edited, "
        "and the most edited files (activitySource says whether edits come from git or are estimated). "
        "Use for 'what should we fix first', 'which areas are risky', 'which folders changed most'.",
        {"type": JSON_SCHEMA_TYPE_OBJECT, "properties": {
            "limit": {"type": "integer", "minimum": 1, "maximum": _AREAS_MAX},
        }},
        lambda **kw: _get_risk_areas(ctx, **kw)))
    registry.register(ToolSpec(
        "get_principle_history",
        "One dimension's per-principle score and grade for each scored run, newest first: "
        "'when did this principle drop', 'which principle is getting worse'.",
        {"type": JSON_SCHEMA_TYPE_OBJECT, "properties": {"dimension": {"type": JSON_SCHEMA_TYPE_STRING}},
         "required": ["dimension"]},
        lambda **kw: _get_principle_history(ctx, **kw)))
