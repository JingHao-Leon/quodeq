"""Provider-agnostic tool registry: one implementation, MCP + function-calling exposure."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable

from quodeq.shared.fault_isolation import run_isolated

_logger = logging.getLogger(__name__)


class ToolError(Exception):
    """User-facing tool failure (bad input, missing context).

    ``public_message`` is the hand-written text the model sees; dispatch reads
    that attribute rather than ``str(exc)`` so the tool result never depends on
    exception formatting (same pattern as ``_ZipSizeLimitError.public_message``).
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.public_message = message


@dataclass(frozen=True)
class ToolSpec:
    """One tool's name, description, JSON-schema parameters and handler."""

    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[..., dict]


class ToolRegistry:
    """The tools one turn may call, in MCP and function-calling shapes."""

    def __init__(self) -> None:
        self._specs: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> None:
        """Add ``spec``; raise ValueError if its name is already registered."""
        if spec.name in self._specs:
            raise ValueError(f"duplicate tool: {spec.name}")
        self._specs[spec.name] = spec

    def names(self) -> list[str]:
        """Return the registered tool names, sorted."""
        return sorted(self._specs)

    def openai_tools(self) -> list[dict]:
        """Return the registry as OpenAI function-calling tool definitions."""
        return [
            {
                "type": "function",
                "function": {
                    "name": s.name,
                    "description": s.description,
                    "parameters": s.parameters,
                },
            }
            for s in self._specs.values()
        ]

    def dispatch(self, name: str, arguments: dict[str, Any]) -> dict:
        """Call tool ``name`` with ``arguments``; never raise, return an ok/error dict.

        ``run_isolated`` is this call's fault-isolation boundary (one model
        tool call): a handler bug that is not one of ``_invoke_tool``'s own
        routine, expected outcomes (unknown tool, ``ToolError``, bad
        arguments) is logged with its traceback and turned into a generic
        failure dict instead of killing the turn.
        """
        return run_isolated(
            lambda: _invoke_tool(self._specs, name, arguments),
            label=f"tool {name}",
            log=_logger,
            on_error=lambda _exc: {"ok": False, "error": f"tool {name} failed internally"},
        )


def _invoke_tool(specs: dict[str, ToolSpec], name: str, arguments: dict[str, Any]) -> dict:
    """Call tool ``name`` with ``arguments``; unknown-tool, ``ToolError`` and
    bad-argument ``TypeError`` are routine, expected outcomes, so they are
    handled here, outside ``dispatch``'s ``run_isolated`` boundary, and never
    logged as a tool crash."""
    spec = specs.get(name)
    if spec is None:
        return {"ok": False, "error": f"unknown tool: {name}"}
    try:
        return {"ok": True, "result": spec.handler(**arguments)}
    except ToolError as exc:
        return {"ok": False, "error": exc.public_message}
    except TypeError:
        return {"ok": False, "error": _invalid_arguments_message(spec, arguments)}


def _invalid_arguments_message(spec: ToolSpec, arguments: dict[str, Any]) -> str:
    """Name what the call got wrong from the tool's own schema, never from the
    ``TypeError`` text: ``dispatch``'s result reaches every ``run_isolated``
    caller in CodeQL's view, so exception text here surfaced as
    py/stack-trace-exposure on unrelated API routes (alerts #356, #357)."""
    accepted = spec.parameters.get("properties", {})
    required = spec.parameters.get("required", [])
    unknown = sorted(k for k in arguments if k not in accepted)
    missing = sorted(k for k in required if k not in arguments)
    parts = [f"invalid arguments for {spec.name}"]
    if unknown:
        parts.append(f"unknown: {', '.join(unknown)}")
    if missing:
        parts.append(f"missing: {', '.join(missing)}")
    parts.append(f"accepted: {', '.join(sorted(accepted)) or 'none'}")
    return "; ".join(parts)
