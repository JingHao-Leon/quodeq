"""Tool-call frames the transcript renders as activity lines.

A call produces one frame when it starts (``running``, with its arguments)
and one when it ends (``ok`` or ``error``, with its duration), joined by
``callId``. Provider-specific names are reduced to the quodeq tool name so
one call reads the same whichever provider ran it. The UI mirrors are
``ui/src/vocab/toolKind.js`` and ``ui/src/vocab/toolStatus.js``.
"""
from __future__ import annotations

import time
import uuid
from enum import StrEnum

from quodeq.assistant.frame_type import FrameType

# Claude Code namespaces MCP tools as mcp__<server>__<tool>; the server is ours.
QUODEQ_TOOL_PREFIX = "mcp__quodeq-assistant__"
# Tools the harness runs around a quodeq call: Claude Code loads deferred
# tool schemas with ToolSearch. Shown as one "preparing" line, never as work.
HARNESS_TOOLS = frozenset({"ToolSearch"})
# What one argument may carry to the transcript: a path and a dimension fit,
# a pasted snippet does not.
ARG_VALUE_MAX_CHARS = 200
ARGS_MAX_ITEMS = 12


class ToolKind(StrEnum):
    """Who the tool belongs to: quodeq's own registry, or the harness around it."""

    QUODEQ = "quodeq"
    HARNESS = "harness"


class ToolStatus(StrEnum):
    """Where one tool call is: started, finished well, or failed."""

    RUNNING = "running"
    OK = "ok"
    ERROR = "error"


def tool_display(raw_name: str) -> tuple[str, ToolKind]:
    """``(name, kind)`` for a provider's tool name."""
    if raw_name.startswith(QUODEQ_TOOL_PREFIX):
        return raw_name[len(QUODEQ_TOOL_PREFIX):], ToolKind.QUODEQ
    if raw_name in HARNESS_TOOLS:
        return raw_name, ToolKind.HARNESS
    return raw_name, ToolKind.QUODEQ


def _compact_value(value):
    if isinstance(value, str):
        return value[:ARG_VALUE_MAX_CHARS]
    if isinstance(value, (bool, int, float)) or value is None:
        return value
    if isinstance(value, list):
        return [_compact_value(v) for v in value[:ARGS_MAX_ITEMS]
                if isinstance(v, (str, bool, int, float))]
    return None


def compact_args(args) -> dict:
    """The arguments a call was made with, reduced to scalars and lists of
    scalars so a frame stays small whatever the model passed."""
    if not isinstance(args, dict):
        return {}
    out = {}
    for key, value in list(args.items())[:ARGS_MAX_ITEMS]:
        compact = _compact_value(value)
        if compact is not None:
            out[str(key)] = compact
    return out


def new_call_id() -> str:
    """An id for a call whose provider announced none."""
    return uuid.uuid4().hex


def start_frame(call_id: str, raw_name: str, args) -> dict:
    """The frame emitted when a tool call begins."""
    name, kind = tool_display(raw_name)
    frame = {"type": FrameType.TOOL_CALL, "callId": call_id, "name": name,
             "kind": kind, "status": ToolStatus.RUNNING}
    compact = compact_args(args)
    if compact:
        frame["args"] = compact
    return frame


def end_frame(call_id: str, raw_name: str, ok: bool, started_at: float | None = None) -> dict:
    """The frame emitted when a tool call ends; *started_at* is a monotonic stamp."""
    name, kind = tool_display(raw_name)
    frame = {"type": FrameType.TOOL_CALL, "callId": call_id, "name": name,
             "kind": kind, "status": ToolStatus.OK if ok else ToolStatus.ERROR}
    if started_at is not None:
        frame["durationMs"] = int((time.monotonic() - started_at) * 1000)
    return frame
