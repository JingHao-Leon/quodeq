"""Cross-platform PID liveness probe (shared, cross-cutting).

Hoisted out of ``data/sqlite/index_sync.py`` so the cancel path
(``services/_external_jobs.py``) and the external-run PID reader
(``data/fs/report_parser/external_pid.py``) can both use it without a
cross-layer import.
"""
from __future__ import annotations

import os
import subprocess
import sys

from quodeq.shared.constants import PLATFORM_WIN32


def is_pid_alive(pid: int) -> bool:
    """Return True if *pid* refers to a live process. POSIX + Windows.

    On POSIX, ``os.kill(pid, 0)`` is the canonical no-op probe.

    On Windows, ``os.kill(pid, 0)`` is *not* a probe — signal 0 is
    ``CTRL_C_EVENT``, and Python implements that via
    ``GenerateConsoleCtrlEvent(CTRL_C_EVENT, pid)``. For an invalid /
    non-existent pid the Win32 call can broadcast Ctrl+C to every
    process sharing the calling console, which on test runners means
    pytest itself receives KeyboardInterrupt mid-run. Use
    ``OpenProcess`` + ``GetExitCodeProcess`` instead, which are
    side-effect-free and tolerate dead PIDs cleanly.
    """
    if sys.platform == PLATFORM_WIN32:
        import ctypes
        from ctypes import wintypes
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        STILL_ACTIVE = 259
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        handle = kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION, False, wintypes.DWORD(pid),
        )
        if not handle:
            return False
        try:
            exit_code = wintypes.DWORD()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)):
                return False
            return exit_code.value == STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except (OSError, ProcessLookupError):
        return False
    return True


_PS_TIMEOUT_S = 5


def process_has_arg(pid: int, token: str) -> bool:
    """True when *pid* is alive and *token* is one of its whole argv tokens.

    Guards a PID read from a file before trusting or signalling it: the OS
    reuses PIDs, so a stale file can name any program. A whole token, not a
    substring: "quodeq" alone also sits in the interpreter's path
    (``.../quodeq/.venv/bin/python``) of every process run from that venv.
    Windows has no ``ps``; there liveness alone has to do.
    """
    if not is_pid_alive(pid):
        return False
    if sys.platform == PLATFORM_WIN32:
        return True
    try:
        out = subprocess.run(
            ["ps", "-o", "command=", "-p", str(pid)],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=_PS_TIMEOUT_S, check=False,
        ).stdout
    except (OSError, subprocess.TimeoutExpired):
        return False
    return token in out.split()
