from quodeq.assistant.adapters import _stream
from quodeq.assistant.adapters._stream import (
    assistant_text, parse_line, partial_text, session_id, tool_uses,
)


def test_parse_line_bad_json():
    assert parse_line("") is None
    assert parse_line("not json") is None
    assert parse_line('{"type": "x"}') == {"type": "x"}


def test_claude_assistant_text():
    ev = {"type": "assistant", "message": {"content": [
        {"type": "text", "text": "Hello "}, {"type": "text", "text": "world"},
        {"type": "tool_use", "name": "search_findings", "input": {"query": "x"}},
    ]}}
    assert assistant_text(ev) == ["Hello ", "world"]
    assert tool_uses(ev) == ["search_findings"]


def test_claude_result_text():
    assert assistant_text({"type": "result", "result": "final answer"}) == ["final answer"]


def test_codex_item_completed_text():
    ev = {"type": "item.completed", "item": {"type": "agent_message", "text": "hi"}}
    assert assistant_text(ev) == ["hi"]


def test_null_message_does_not_crash():
    ev = {"type": "assistant", "message": None}
    assert assistant_text(ev) == []
    assert tool_uses(ev) == []


def test_null_item_does_not_crash():
    ev = {"type": "item.completed", "item": None}
    assert assistant_text(ev) == []
    assert tool_uses(ev) == []


def test_null_content_does_not_crash():
    ev = {"type": "assistant", "message": {"content": None}}
    assert assistant_text(ev) == []
    assert tool_uses(ev) == []


def test_session_id_from_system_and_result():
    assert session_id({"type": "system", "session_id": "uuid-1"}) == "uuid-1"
    assert session_id({"type": "result", "session_id": "uuid-2"}) == "uuid-2"
    assert session_id({"type": "assistant", "message": {"content": []}}) is None
    assert session_id({"type": "session.created", "thread_id": "th-9"}) == "th-9"


def test_tool_use_details_carries_id_and_raw_args():
    event = {"type": "assistant", "message": {"content": [
        {"type": "tool_use", "id": "toolu_1", "name": "get_report",
         "input": {"dimension": "security"}}]}}
    assert _stream.tool_use_details(event) == [
        {"id": "toolu_1", "name": "get_report", "args": {"dimension": "security"}}]


def test_tool_use_details_without_id_or_input():
    event = {"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": "get_scores", "input": {}}]}}
    assert _stream.tool_use_details(event) == [{"id": None, "name": "get_scores", "args": {}}]


def test_codex_mcp_tool_call_surfaces_with_tool_name():
    # Real codex shape: item.started with type mcp_tool_call.
    event = {"type": "item.started", "item": {
        "id": "item_2", "type": "mcp_tool_call", "server": "quodeq-assistant",
        "tool": "get_context", "arguments": {}, "result": None,
        "error": None, "status": "in_progress"}}
    assert _stream.tool_use_details(event) == [{"id": "item_2", "name": "get_context", "args": {}}]


def test_codex_mcp_tool_call_includes_args():
    event = {"type": "item.started", "item": {
        "type": "mcp_tool_call", "server": "quodeq-assistant",
        "tool": "search_findings", "arguments": {"query": "auth"},
        "status": "in_progress"}}
    assert _stream.tool_use_details(event) == [
        {"id": None, "name": "search_findings", "args": {"query": "auth"}}]


def test_codex_command_execution_surfaces_as_shell():
    event = {"type": "item.started", "item": {
        "id": "item_1", "type": "command_execution",
        "command": "/bin/zsh -lc 'echo hi'", "aggregated_output": "",
        "exit_code": None, "status": "in_progress"}}
    assert _stream.tool_use_details(event) == [
        {"id": "item_1", "name": "shell", "args": {"command": "/bin/zsh -lc 'echo hi'"}}]


def test_codex_tool_item_completed_is_a_result_not_a_second_call():
    completed = {"type": "item.completed", "item": {
        "id": "item_1", "type": "command_execution", "command": "/bin/zsh -lc 'echo hi'",
        "aggregated_output": "hi\n", "exit_code": 0, "status": "completed"}}
    assert _stream.tool_use_details(completed) == []
    assert _stream.tool_result_details(completed) == [{"id": "item_1", "name": "shell", "ok": True}]
    mcp_failed = {"type": "item.completed", "item": {
        "type": "mcp_tool_call", "tool": "get_context", "arguments": {},
        "status": "failed", "error": {"message": "boom"}}}
    assert _stream.tool_use_details(mcp_failed) == []
    assert _stream.tool_result_details(mcp_failed) == [{"id": None, "name": "get_context", "ok": False}]


def test_claude_tool_result_blocks_close_calls_by_id():
    event = {"type": "user", "message": {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": "toolu_1", "content": "ok"},
        {"type": "tool_result", "tool_use_id": "toolu_2", "content": "x", "is_error": True},
        {"type": "text", "text": "ignored"}]}}
    assert _stream.tool_result_details(event) == [
        {"id": "toolu_1", "name": None, "ok": True}, {"id": "toolu_2", "name": None, "ok": False}]
    assert _stream.tool_result_details({"type": "assistant", "message": {"content": []}}) == []


def test_partial_text_extracts_text_delta():
    # Real claude shape with --include-partial-messages: stream_event wrapping
    # the Anthropic SSE content_block_delta.
    ev = {"type": "stream_event", "event": {
        "type": "content_block_delta", "index": 0,
        "delta": {"type": "text_delta", "text": "hel"}}}
    assert partial_text(ev) == "hel"


def test_partial_text_ignores_non_text_deltas():
    for delta in ({"type": "thinking_delta", "thinking": "hmm"},
                  {"type": "input_json_delta", "partial_json": '{"q'}):
        ev = {"type": "stream_event", "event": {
            "type": "content_block_delta", "index": 0, "delta": delta}}
        assert partial_text(ev) is None


def test_partial_text_ignores_other_stream_events():
    for inner in ({"type": "message_start"},
                  {"type": "content_block_start", "content_block": {"type": "text", "text": ""}},
                  {"type": "content_block_stop"},
                  {"type": "message_stop"}):
        assert partial_text({"type": "stream_event", "event": inner}) is None


def test_partial_text_ignores_non_stream_events_and_malformed():
    assert partial_text({"type": "assistant", "message": {"content": []}}) is None
    assert partial_text({"type": "stream_event"}) is None
    assert partial_text({"type": "stream_event", "event": None}) is None
    assert partial_text({"type": "stream_event", "event": {
        "type": "content_block_delta", "delta": {"type": "text_delta", "text": 3}}}) is None


def test_stream_event_is_not_assistant_text_or_tool_use():
    ev = {"type": "stream_event", "event": {
        "type": "content_block_delta", "index": 0,
        "delta": {"type": "text_delta", "text": "hi"}}}
    assert assistant_text(ev) == []
    assert tool_uses(ev) == []


def test_codex_agent_message_completed_is_not_a_tool_call():
    event = {"type": "item.completed", "item": {"type": "agent_message", "text": "hi"}}
    assert _stream.tool_use_details(event) == []
