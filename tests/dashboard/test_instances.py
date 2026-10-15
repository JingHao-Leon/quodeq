"""quodeq status / stop: see and stop the recorded window and API, never a stranger."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from quodeq.cli import main
from quodeq.dashboard.instances import (
    API_PID_FILE,
    WINDOW_PID_FILE,
    clear_window_pid,
    dashboard_status,
    record_window_pid,
    stop_dashboard,
)
from quodeq.services.running_evaluations import running_evaluations

posix_only = pytest.mark.skipif(sys.platform == "win32", reason="checks the command line with ps")


def _sleeper(*argv_tail: str) -> subprocess.Popen:
    """A 30 s sleeper whose command line carries *argv_tail* (what ps shows)."""
    return subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)", *argv_tail])


@pytest.fixture(autouse=True)
def _isolated_run_dir(monkeypatch, tmp_path):
    """Keep the window-socket probe away from a real running Quodeq."""
    monkeypatch.setenv("QUODEQ_RUN_DIR", str(tmp_path / "run"))


@pytest.fixture
def procs():
    started: list[subprocess.Popen] = []
    yield started
    for proc in started:
        proc.kill()
        proc.wait(timeout=5)


def test_nothing_running(tmp_path, capsys) -> None:
    assert stop_dashboard(tmp_path) == 0
    assert "isn't running" in capsys.readouterr().out


@posix_only
def test_stops_the_recorded_window_and_api(tmp_path, procs, capsys) -> None:
    window, api = _sleeper("quodeq.dashboard._webview_window"), _sleeper("quodeq.api.app")
    procs += [window, api]
    (tmp_path / WINDOW_PID_FILE).write_text(str(window.pid), encoding="utf-8")
    (tmp_path / API_PID_FILE).write_text(json.dumps({"pid": api.pid, "port": 7863}), encoding="utf-8")

    stop_dashboard(tmp_path)

    assert window.wait(timeout=10) is not None and api.wait(timeout=10) is not None
    out = capsys.readouterr().out
    assert "Stopped the Quodeq window and API." in out
    assert "Running evaluations keep going" in out
    assert not (tmp_path / WINDOW_PID_FILE).exists() and not (tmp_path / API_PID_FILE).exists()


@posix_only
def test_a_reused_pid_is_left_alone(tmp_path, procs, capsys) -> None:
    # Run from the same venv, so "quodeq" is in its interpreter path: the
    # check must still tell it apart from a real window.
    stranger = _sleeper("someone-elses-process")
    procs.append(stranger)
    (tmp_path / WINDOW_PID_FILE).write_text(str(stranger.pid), encoding="utf-8")

    stop_dashboard(tmp_path)

    assert stranger.poll() is None, "a PID the OS reused for another program must survive"
    assert "isn't running" in capsys.readouterr().out
    assert not (tmp_path / WINDOW_PID_FILE).exists(), "the stale file is cleared"


def test_window_pid_file_is_cleared_only_by_its_owner(tmp_path) -> None:
    path = record_window_pid(tmp_path)
    assert path.read_text(encoding="utf-8") == str(os.getpid())

    path.write_text("999999", encoding="utf-8")  # a newer window took over
    clear_window_pid(path)
    assert path.exists()

    path.write_text(str(os.getpid()), encoding="utf-8")
    clear_window_pid(path)
    assert not path.exists()


@pytest.mark.usefixtures("restore_environ")  # main() sets PYTHONUTF8 for the process
def test_cli_dispatches_stop(monkeypatch, tmp_path: Path, capsys) -> None:
    monkeypatch.setenv("QUODEQ_RUN_DIR", str(tmp_path))
    assert main(["stop"]) == 0
    assert "isn't running" in capsys.readouterr().out


def _run(evaluations: Path, project: str, run: str, *, state: str, pid: int, pid_written_at: float | None = None) -> None:
    run_dir = evaluations / project / run
    run_dir.mkdir(parents=True)
    (evaluations / project / "repository_info.json").write_text(json.dumps({"name": "quodeq-web"}), encoding="utf-8")
    (run_dir / ".pid").write_text(str(pid), encoding="utf-8")
    if pid_written_at is not None:
        os.utime(run_dir / ".pid", (pid_written_at, pid_written_at))
    (run_dir / "status.json").write_text(json.dumps({
        "state": state, "dimensions": ["security"], "started_at": "2026-10-15T09:00:00+00:00",
    }), encoding="utf-8")


@posix_only
def test_running_evaluations_trust_neither_a_final_state_nor_a_reused_pid(tmp_path, procs) -> None:
    evaluation, stranger = _sleeper("evaluate"), _sleeper("someone-elses-process")
    procs += [evaluation, stranger]
    _run(tmp_path, "p1", "live", state="running", pid=evaluation.pid)
    _run(tmp_path, "p2", "cancelled", state="cancelled", pid=evaluation.pid)  # finished, pid file kept
    # crashed an hour ago; the OS has since handed its pid to another program
    _run(tmp_path, "p3", "reused", state="running", pid=stranger.pid, pid_written_at=time.time() - 3600)

    runs = running_evaluations(tmp_path)

    assert [(r.project, r.pid, r.dimensions) for r in runs] == [("quodeq-web", evaluation.pid, ["security"])]


@posix_only
def test_status_lists_window_api_and_evaluations(tmp_path, procs, capsys) -> None:
    window, api, evaluation = _sleeper("quodeq.dashboard._webview_window"), _sleeper("quodeq.api.app"), _sleeper("evaluate")
    procs += [window, api, evaluation]
    run_dir, evaluations = tmp_path / "rd", tmp_path / "ev"
    run_dir.mkdir()
    (run_dir / WINDOW_PID_FILE).write_text(str(window.pid), encoding="utf-8")
    (run_dir / API_PID_FILE).write_text(json.dumps({"pid": api.pid, "host": "127.0.0.1", "port": 1}), encoding="utf-8")
    _run(evaluations, "p1", "live", state="running", pid=evaluation.pid)

    dashboard_status(run_dir, evaluations)

    out = capsys.readouterr().out
    assert f"open (pid {window.pid})" in out
    assert f"http://127.0.0.1:1, not answering (pid {api.pid})" in out
    assert "1 running" in out and f"quodeq-web: security (pid {evaluation.pid}" in out


def test_status_when_nothing_runs(tmp_path, capsys) -> None:
    dashboard_status(tmp_path, tmp_path)
    out = capsys.readouterr().out
    assert "Quodeq isn't running." in out and "none running" in out
