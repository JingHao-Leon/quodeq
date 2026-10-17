"""Environment-based configuration for the embedded assistant.

The assistant layer never reads the environment at import time; the prompt
source path is resolved here, lazily per call, and passed in.
"""
from __future__ import annotations

from pathlib import Path

from quodeq.shared.env import get_quodeq_dir
from quodeq.shared.env_resolve import resolve_env

_MCP_LOG_FILENAME = "assistant-mcp.log"


def assistant_context_path(env: dict[str, str] | None = None) -> Path:
    """Return the assistant system-prompt source, honoring QUODEQ_ASSISTANT_CONTEXT_PATH.

    Unset means the packaged quodeq_context.md.
    """
    default = Path(__file__).resolve().parent.parent / "data" / "assistant" / "quodeq_context.md"
    return Path(resolve_env(env).get("QUODEQ_ASSISTANT_CONTEXT_PATH", str(default)))


def read_assistant_context(env: dict[str, str] | None = None) -> str:
    """Read the assistant system-prompt source, resolved lazily per call.

    Default reader for ``assistant._context.build_system_prompt``: honors the
    same ``QUODEQ_ASSISTANT_CONTEXT_PATH`` override as :func:`assistant_context_path`.
    """
    return assistant_context_path(env).read_text(encoding="utf-8")


def assistant_mcp_log_path(env: dict[str, str] | None = None) -> Path:
    """Where the assistant's MCP server writes its warnings and tool tracebacks.

    The server's stderr belongs to the CLI that spawned it and is never shown,
    so a tool crash would otherwise leave no trace. Under the state dir
    (QUODEQ_DIR or ``~/.quodeq``), next to the assistant database.
    """
    return get_quodeq_dir(resolve_env(env)) / _MCP_LOG_FILENAME
