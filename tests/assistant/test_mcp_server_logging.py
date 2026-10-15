"""The MCP server's warnings land in a file, or on the fallback stream."""
import io
import logging

from quodeq.assistant.mcp.server import configure_logging
from quodeq.config.assistant_env import assistant_mcp_log_path


def test_log_path_sits_in_the_state_dir(tmp_path):
    assert assistant_mcp_log_path({"QUODEQ_DIR": str(tmp_path)}) == tmp_path / "assistant-mcp.log"


def test_configure_logging_writes_warnings_to_the_file(tmp_path):
    handler = configure_logging(tmp_path / "mcp.log", fallback=io.StringIO())
    try:
        logging.getLogger("quodeq.test.mcp").warning("tool get_report failed", exc_info=False)
        handler.flush()
    finally:
        logging.getLogger('quodeq').removeHandler(handler)
    text = (tmp_path / "mcp.log").read_text()
    assert "WARNING quodeq.test.mcp: tool get_report failed" in text


def test_configure_logging_falls_back_to_the_stream_when_the_file_cannot_open(tmp_path):
    fallback = io.StringIO()
    handler = configure_logging(tmp_path / "missing-dir" / "mcp.log", fallback=fallback)
    try:
        logging.getLogger("quodeq.test.mcp").warning("boom")
        handler.flush()
    finally:
        logging.getLogger('quodeq').removeHandler(handler)
    assert "boom" in fallback.getvalue()
