"""The webview's diagnostic log file, opened once for the process.

The native-window code paths run inside AppKit callbacks where a raised
exception is swallowed by the ObjC runtime, so they trace to this file
instead. Falls back to stderr when the log cannot be opened.
"""
from __future__ import annotations

import functools
import os
import sys
from pathlib import Path
from typing import TextIO

# Owner-only, like the other per-user stores: the log holds native-window traces.
_DIR_MODE = 0o700
_FILE_MODE = 0o600


def _diag_path() -> Path:
    """The webview debug log's path under the user's quodeq run directory."""
    return Path.home() / ".quodeq" / "run" / "webview_debug.log"


@functools.cache
def diag_stream() -> TextIO:
    """Open (or reuse) the webview diagnostic log on the first trace."""
    path = _diag_path()
    try:
        path.parent.mkdir(mode=_DIR_MODE, parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, _FILE_MODE)
        os.chmod(path, _FILE_MODE)  # a log created before this change keeps the umask mode otherwise
        return os.fdopen(fd, "a", encoding="utf-8")  # noqa: SIM115 — lives for the process
    except OSError:
        return sys.stderr


_DIAG_OLD_NAME = "diag"  # __getattr__ shim for the old module-level stream object


def __getattr__(name: str):
    if name == _DIAG_OLD_NAME:
        return diag_stream()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
