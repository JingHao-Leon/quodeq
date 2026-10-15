"""Tool activity frames: name normalization, argument compaction, start/end shape."""
from quodeq.assistant.tool_activity import (
    ToolKind, ToolStatus, compact_args, end_frame, start_frame, tool_display,
)


def test_tool_display_strips_the_mcp_prefix_and_marks_harness_tools():
    assert tool_display("mcp__quodeq-assistant__get_violations") == ("get_violations", ToolKind.QUODEQ)
    assert tool_display("get_violations") == ("get_violations", ToolKind.QUODEQ)
    assert tool_display("ToolSearch") == ("ToolSearch", ToolKind.HARNESS)


def test_compact_args_keeps_scalars_and_scalar_lists_only():
    args = {"path": "a/" + "b" * 300, "limit": 50, "flag": True, "nested": {"x": 1},
            "ids": ["r1", {"no": 1}, "r2"], "none": None}
    out = compact_args(args)
    assert out["path"] == "a/" + "b" * 198 and len(out["path"]) == 200
    assert out["limit"] == 50 and out["flag"] is True and out["ids"] == ["r1", "r2"]
    assert "nested" not in out and "none" not in out
    assert compact_args(None) == {} and compact_args("x") == {}


def test_start_and_end_frames_share_the_call_id_and_name():
    start = start_frame("c1", "mcp__quodeq-assistant__get_report", {"dimension": "security"})
    assert start == {"type": "tool_call", "callId": "c1", "name": "get_report", "kind": "quodeq",
                     "status": ToolStatus.RUNNING, "args": {"dimension": "security"}}
    assert "args" not in start_frame("c2", "get_scores", {})
    end = end_frame("c1", "mcp__quodeq-assistant__get_report", False, started_at=None)
    assert end == {"type": "tool_call", "callId": "c1", "name": "get_report", "kind": "quodeq",
                   "status": ToolStatus.ERROR}
    assert end_frame("c1", "get_report", True, started_at=0.0)["durationMs"] > 0
