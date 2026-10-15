"""Run a noisy child process quietly, with a spinner while it works.

npm and Vite print a line per package and per output chunk (100+ lines),
which is noise when the build works and the whole story when it doesn't.
The output goes to a temp file and is replayed to stderr only on failure.
On a terminal a spinner with the elapsed seconds shows the build is alive.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
import time
from collections.abc import Mapping, Sequence
from typing import IO

_FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
_TICK_S = 0.1  # spinner frame interval, also the child poll interval
_REAP_TIMEOUT_S = 5  # wait for the child to exit after kill()


def run_quiet(
    cmd: Sequence[str], *, label: str, cwd: str, timeout: float,
    env: Mapping[str, str] | None = None, stream: IO[str] | None = None,
) -> None:
    """Run *cmd*; raise ``CalledProcessError`` / ``TimeoutExpired`` like ``subprocess.run(check=True)``."""
    stream = stream or sys.stderr
    with tempfile.TemporaryFile() as out:
        proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=out, stderr=subprocess.STDOUT)
        try:
            _wait_with_spinner(proc, label, timeout, stream)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=_REAP_TIMEOUT_S)
            _replay(out, stream)
            raise
        if proc.returncode:
            _replay(out, stream)
            raise subprocess.CalledProcessError(proc.returncode, list(cmd))


def _wait_with_spinner(proc: subprocess.Popen, label: str, timeout: float, stream: IO[str]) -> None:
    animate = stream.isatty()
    started = time.monotonic()
    frame = 0
    try:
        while True:
            try:
                proc.wait(timeout=_TICK_S)
                return
            except subprocess.TimeoutExpired:
                elapsed = time.monotonic() - started
                if elapsed > timeout:
                    raise subprocess.TimeoutExpired(proc.args, timeout) from None
                if animate:
                    stream.write(f"\r{_FRAMES[frame % len(_FRAMES)]} {label} {elapsed:.0f}s")
                    stream.flush()
                    frame += 1
    finally:
        if animate:
            stream.write("\r\x1b[K")
            stream.flush()


def _replay(out: IO[bytes], stream: IO[str]) -> None:
    out.seek(0)
    stream.write(out.read().decode(errors="replace"))
    stream.flush()
