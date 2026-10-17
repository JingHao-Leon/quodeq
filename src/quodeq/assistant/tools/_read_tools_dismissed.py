"""Dismissed and verified findings tool: the Violations tab's dismissed
status and the verified checkmarks, each with its own reason or note."""
from __future__ import annotations

from quodeq.assistant.tools._constants import JSON_SCHEMA_TYPE_OBJECT
from quodeq.assistant.tools._context import ToolContext
from quodeq.assistant.tools._read_tools_scope import project_location
from quodeq.assistant.tools._read_tools_violations import visible_only
from quodeq.assistant.tools.registry import ToolError, ToolRegistry, ToolSpec
from quodeq.core.dismissals import DismissedEntry
from quodeq.core.utils.numbers import clamp
from quodeq.services.dismissed import dismissed_keys, load_dismissed
from quodeq.services.verified import verified_entries

_DEFAULT_LIMIT = 20
DISMISSED_MAX_LIMIT = 100
_VERIFIED_CAP = 50
_ITEM_FIELDS = ("file", "line", "dimension", "principle", "severity", "title", "reason")


def _row(item: dict, entry: DismissedEntry | None) -> dict:
    row = {k: item.get(k) for k in _ITEM_FIELDS}
    row["requirement"] = item.get("req")
    if entry is not None:
        row["dismissReason"] = entry.reason
        row["dismissedAt"] = entry.dismissed_at.isoformat() if entry.dismissed_at else None
        row["dismissedFromRun"] = entry.run_id
    return row


def get_dismissed(ctx: ToolContext, limit: int = _DEFAULT_LIMIT, offset: int = 0,
                  include_verified: bool = False) -> dict:
    """One page of the project's dismissed findings with why and when each
    was dismissed; optionally the findings marked verified."""
    reports_root, project = project_location(ctx)
    project_dir = reports_root / project
    if not project_dir.is_dir():
        raise ToolError(f"project {project} not found under the evaluations directory")
    limit = clamp(int(limit), 1, DISMISSED_MAX_LIMIT)
    offset = max(0, int(offset))
    try:
        state = dismissed_keys(project_dir)
        items = load_dismissed(project_dir, offset=offset, limit=limit)
    except (OSError, ValueError) as exc:
        raise ToolError(f"could not read dismissals of project {project}: {exc}") from exc
    by_key = {(e.req, e.file, e.line): e for e in state.entries}
    rows = [_row(it, by_key.get((it.get("req"), it.get("file"), it.get("line")))) for it in items]
    kept, hidden = visible_only(ctx, rows)
    out = {"project": project, "count": len(state.entries), "offset": offset,
           "dismissed": kept, "hiddenStandardIds": hidden}
    if include_verified:
        out["verified"] = verified_entries(project_dir, limit=_VERIFIED_CAP)
    return out


def register_dismissed_tools(registry: ToolRegistry, ctx: ToolContext) -> None:
    registry.register(ToolSpec(
        "get_dismissed",
        "The project's dismissed findings (dismissals are project-wide and "
        "survive runs): location, dimension, principle, severity, title, the "
        "finding's reason, and the dismissal's own reason, time and the run it "
        "was made from. `count` is the total; page with `limit`/`offset`. "
        "`include_verified` adds the findings marked verified with their "
        "notes. Use it for 'what did we dismiss', 'why was this dismissed' "
        "and 'which findings are verified'.",
        {"type": JSON_SCHEMA_TYPE_OBJECT, "properties": {
            "limit": {"type": "integer", "minimum": 1, "maximum": DISMISSED_MAX_LIMIT},
            "offset": {"type": "integer", "minimum": 0},
            "include_verified": {"type": "boolean"},
        }},
        lambda **kw: get_dismissed(ctx, **kw)))
