"""Hand the terminal back once the native window owns the dashboard.

The window and the Action API each run in their own session, and the window
stops the API when it closes, so the launcher has nothing left to do once
the window is up. Returning lets the person close the terminal or keep using
it. Foreground stays the rule wherever the terminal is still the only way to
stop the server or read its output.
"""
from __future__ import annotations

import subprocess
import time
import typing
from pathlib import Path

from quodeq.dashboard._config import DashboardConfig
from quodeq.shared.logging import log_info
from quodeq.shared.utils import IS_WIN32

_WINDOW_UP_TIMEOUT_S = 15  # webview import + first paint is ~1-2 s; generous for cold disks
_WINDOW_UP_POLL_S = 0.2

FOREGROUND_HINT = "Keep this terminal open. Close it or press Ctrl+C to stop Quodeq."
DETACHED_HINT = "Quodeq runs in its window now. You can close this terminal."


def detach_allowed(config: DashboardConfig) -> bool:
    """True when the launcher may exit and leave the window in charge.

    Foreground for --dev and --verbose (their output is the point), for
    --browser and --no-open (no window would stop the server), and on
    Windows, where the children stay attached to the console.
    """
    build = config.build
    return (
        build.use_native and build.open_browser
        and not (build.dev or build.verbose or build.foreground)
        and not IS_WIN32
    )


def window_came_up(
    window_proc: subprocess.Popen, sock_path: Path,
    *, timeout_s: float = _WINDOW_UP_TIMEOUT_S, sleep: typing.Callable[[float], None] = time.sleep,
) -> bool:
    """Wait until the window has bound its reload socket; False if it died or never did.

    Checks the socket file rather than connecting: a refused connection
    (bound, not yet listening) makes ``InstanceController.probe_existing``
    delete the file the window just created.
    """
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if window_proc.poll() is not None:
            return False
        if sock_path.exists():
            return True
        sleep(_WINDOW_UP_POLL_S)
    return False


def choose_detach(config: DashboardConfig) -> bool:
    """``detach_allowed``, telling the person up front when the terminal stays bound."""
    detach = detach_allowed(config)
    if not detach:
        log_info(FOREGROUND_HINT)
    return detach


def handed_to_window(window_proc: subprocess.Popen, sock_path: Path) -> bool:
    """True once the window is up and owns the dashboard; else fall back to foreground."""
    if window_came_up(window_proc, sock_path):
        log_info(DETACHED_HINT)
        return True
    log_info(FOREGROUND_HINT)
    return False
