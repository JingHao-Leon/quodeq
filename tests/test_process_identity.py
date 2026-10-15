"""is_original_process: a live PID counts only if it started before it was recorded."""
from __future__ import annotations

import os
import subprocess
import sys
import time

import pytest

from quodeq.shared.process import is_original_process, process_started_at

posix_only = pytest.mark.skipif(sys.platform == "win32", reason="start time comes from ps")


@posix_only
def test_start_time_of_this_process_is_in_the_past() -> None:
    started = process_started_at(os.getpid())
    assert started is not None and started <= time.time()


@posix_only
def test_a_process_recorded_after_it_started_is_the_original() -> None:
    assert is_original_process(os.getpid(), time.time())


@posix_only
def test_a_process_that_started_after_the_record_is_a_reused_pid() -> None:
    recorded_long_ago = time.time() - 3600  # e.g. a .pid written by a run an hour ago
    stranger = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        assert not is_original_process(stranger.pid, recorded_long_ago)
    finally:
        stranger.kill()
        stranger.wait(timeout=5)


def test_a_dead_pid_is_never_the_original() -> None:
    assert not is_original_process(999_999_999, time.time())
