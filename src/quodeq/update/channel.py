"""Detect how quodeq was installed and the matching upgrade command.

Path-based and dependency-free. An ambiguous result MUST fall back to the
generic pip command rather than guess wrong (telling a pipx user to run
`pip install -U` breaks their isolated venv).
"""

from __future__ import annotations

import sys
from collections.abc import Mapping
from pathlib import Path

from quodeq.shared.env_resolve import resolve_env

_PACKAGE = "quodeq"
_FALLBACK = f"pip install -U {_PACKAGE}"

CHANNEL_FROZEN = "frozen"  # bundled app (PyInstaller etc.)
CHANNEL_WHEEL = "wheel"  # pip-style install

_TOOL_PIPX = "pipx"
_TOOL_UV = "uv"
_TOOL_BREW = "brew"
_TOOL_ARGV = {
    _TOOL_PIPX: ("pipx", "upgrade", _PACKAGE),
    _TOOL_UV: ("uv", "tool", "upgrade", _PACKAGE),
    _TOOL_BREW: ("brew", "upgrade", _PACKAGE),
}


def detect_channel() -> str:
    """Return CHANNEL_FROZEN for the bundled app, CHANNEL_WHEEL for a pip-style install."""
    return CHANNEL_FROZEN if getattr(sys, "frozen", False) else CHANNEL_WHEEL


def _detect_tool(environ: Mapping[str, str], package_file: str | None) -> str | None:
    """The tool that owns this install ("pipx", "uv", "brew"), None when unrecognised."""
    try:
        path = str(Path(package_file or __file__).resolve()).replace("\\", "/")
    except OSError:
        return None
    roots = [
        (environ.get("PIPX_HOME"), _TOOL_PIPX),
        (str(Path.home() / ".local" / "pipx" / "venvs"), _TOOL_PIPX),
        ("/pipx/venvs", _TOOL_PIPX),
        (environ.get("UV_TOOL_DIR"), _TOOL_UV),
        (str(Path.home() / ".local" / "share" / "uv" / "tools"), _TOOL_UV),
        ("/uv/tools", _TOOL_UV),
        ("/Cellar/", _TOOL_BREW),
        ("/homebrew/", _TOOL_BREW),
    ]
    for root, tool in roots:
        if root and root.replace("\\", "/") in path:
            return tool
    return None


def upgrade_command(
    env: Mapping[str, str] | None = None,
    package_file: str | None = None,
) -> str:
    """Return the shell command that upgrades this install, "" when frozen.

    Decided by where the package file sits: a pipx, uv-tool, or Homebrew root
    in the path picks that tool's command. Anything unrecognised falls back to
    ``pip install -U``. *env* and *package_file* exist for tests.
    """
    if detect_channel() == CHANNEL_FROZEN:
        return ""
    tool = _detect_tool(resolve_env(env), package_file)
    return " ".join(_TOOL_ARGV[tool]) if tool else _FALLBACK


def upgrade_argv(
    env: Mapping[str, str] | None = None,
    package_file: str | None = None,
    executable: str | None = None,
) -> list[str] | None:
    """Return the argv ``quodeq upgrade`` runs, None when frozen.

    Same detection as ``upgrade_command``, except the pip fallback runs
    ``<this python> -m pip`` so it upgrades the environment quodeq is running
    from, never whichever ``pip`` comes first on PATH.
    """
    if detect_channel() == CHANNEL_FROZEN:
        return None
    tool = _detect_tool(resolve_env(env), package_file)
    if tool:
        return list(_TOOL_ARGV[tool])
    return [executable or sys.executable, "-m", "pip", "install", "-U", _PACKAGE]
