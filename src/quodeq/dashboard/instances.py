"""``quodeq status`` and ``quodeq stop``: see and stop the running dashboard.

The way out once the launcher has handed the terminal back: a hung window
has no Ctrl+C. Every process is found through a PID file (the run dir's
``window.pid`` / ``action_api.pid``, a run's ``.pid``) and only trusted after
its command line shows it still is that quodeq process, so a stale file whose
PID the OS has since reused never names, or takes down, a stranger.
``stop`` never touches evaluations: they run in their own sessions and keep going.
"""
from __future__ import annotations

import json
import logging
import os
import signal
import time
from collections.abc import Callable
from pathlib import Path

from quodeq.dashboard._api_health_check import action_api_healthy
from quodeq.dashboard._instance import InstanceController
from quodeq.shared.env_paths import ensure_run_dir, get_evaluations_dir
from quodeq.shared.frozen import subprocess_cmd
from quodeq.services.running_evaluations import running_evaluations
from quodeq.shared.process import is_pid_alive, process_has_arg

_logger = logging.getLogger(__name__)

WINDOW_PID_FILE = "window.pid"
API_PID_FILE = "action_api.pid"  # written by dashboard._api_spawn
_GRACE_S = 5  # SIGTERM first; SIGKILL whatever is still alive after this
_POLL_S = 0.1


def record_window_pid(run_dir: Path | None = None) -> Path:
    """Write this (window) process's PID; the window calls it at start.

    Fail-soft: an unwritable run dir costs ``quodeq stop`` the window, never
    the window itself.
    """
    path = (run_dir or ensure_run_dir()) / WINDOW_PID_FILE
    try:
        path.write_text(str(os.getpid()), encoding="utf-8")
    except OSError:
        _logger.debug("could not record the window PID in %s", path, exc_info=True)
    return path


def clear_window_pid(path: Path) -> None:
    """Remove *path* on the window's way out, unless a newer window owns it now."""
    if _read_pid(path) == os.getpid():
        path.unlink(missing_ok=True)


def _read_pid(path: Path) -> int | None:
    """The PID in *path*: a bare int (window) or ``{"pid": n, ...}`` (API)."""
    try:
        raw = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if raw.isdigit():
        return int(raw)
    if raw.startswith("{"):
        try:
            pid = json.loads(raw).get("pid")
        except (ValueError, AttributeError):
            return None
        return pid if isinstance(pid, int) and not isinstance(pid, bool) and pid > 0 else None
    return None


def _launch_marker(mode: str) -> str:
    """The argv token that names *mode*'s process: its ``-m`` module, or ``--_<mode>`` when frozen.

    Taken from the very command the launcher spawns it with, so the two can't drift.
    """
    return subprocess_cmd(mode)[-1]


def _signal(pid: int, sig: int) -> None:
    try:
        os.kill(pid, sig)
    except OSError as exc:  # already gone between the check and the signal
        _logger.debug("signal %s to pid %s failed: %s", sig, pid, exc)


def _stop_pids(pids: list[int], sleep: Callable[[float], None] = time.sleep) -> None:
    """SIGTERM *pids*, then SIGKILL any still alive after the grace period.

    On Windows SIGTERM is TerminateProcess, which works whether or not the
    process shares this console (CTRL_BREAK_EVENT would not).
    """
    for pid in pids:
        _signal(pid, signal.SIGTERM)
    deadline = time.monotonic() + _GRACE_S
    while time.monotonic() < deadline and any(is_pid_alive(pid) for pid in pids):
        sleep(_POLL_S)
    for pid in pids:
        if is_pid_alive(pid):
            _signal(pid, getattr(signal, "SIGKILL", signal.SIGTERM))


def stop_dashboard(run_dir: Path | None = None) -> int:
    """Stop the window and the API recorded in *run_dir*. Exit code 0 either way."""
    run_dir = run_dir or ensure_run_dir()
    found: dict[str, int] = {}
    for label, name, mode in (("window", WINDOW_PID_FILE, "webview"), ("API", API_PID_FILE, "api")):
        path = run_dir / name
        pid = _read_pid(path)
        if pid is not None and process_has_arg(pid, _launch_marker(mode)):
            found[label] = pid
        path.unlink(missing_ok=True)  # stale or about to be: either way done with
    if not found:
        print("Quodeq isn't running.")
        return 0
    _stop_pids(list(found.values()))
    print(f"Stopped the Quodeq {' and '.join(found)}.")
    print("Running evaluations keep going. Open Quodeq again to follow or cancel them.")
    return 0


def _api_line(run_dir: Path) -> str | None:
    path = run_dir / API_PID_FILE
    pid = _read_pid(path)
    if pid is None or not process_has_arg(pid, _launch_marker("api")):
        return None
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        record = {}
    record = record if isinstance(record, dict) else {}
    url = f"http://{record.get('host') or '127.0.0.1'}:{record.get('port')}"
    if not record.get("port"):
        return f"running (pid {pid})"
    health = "answering" if action_api_healthy(url) else "not answering"
    return f"{url}, {health} (pid {pid})"


def dashboard_status(run_dir: Path | None = None, evaluations_dir: Path | None = None) -> int:
    """Print the window, the API and the running evaluations. Exit code 0 either way."""
    run_dir = run_dir or ensure_run_dir()
    evaluations_dir = evaluations_dir or Path(get_evaluations_dir())
    window_pid = _read_pid(run_dir / WINDOW_PID_FILE)
    window_up = window_pid is not None and process_has_arg(window_pid, _launch_marker("webview"))
    if not window_up and InstanceController().probe_existing():
        window_pid, window_up = None, True  # a window from before window.pid existed
    api = _api_line(run_dir)
    runs = running_evaluations(evaluations_dir)

    if not window_up and api is None:
        print("Quodeq isn't running.")
    else:
        pid_note = f" (pid {window_pid})" if window_pid else ""
        print(f"Window       {'open' + pid_note if window_up else 'closed'}")
        print(f"API          {api or 'not running'}")
    if not runs:
        print("Evaluations  none running")
    else:
        print(f"Evaluations  {len(runs)} running")
    for run in runs:
        since = f", {run.running_for}" if run.running_for else ""
        print(f"  {run.project}: {', '.join(run.dimensions) or 'starting'} (pid {run.pid}{since})")
    return 0
