"""quodeq restart reopens the dashboard with the flags it was started with."""
from __future__ import annotations

from pathlib import Path

from unittest.mock import MagicMock, patch

import pytest

from quodeq import cli
from quodeq.dashboard import cli as dashboard_cli
from quodeq.dashboard import runner
from quodeq.dashboard.instances import LAUNCH_ARGS_FILE, LaunchRecord, read_launch_args, record_launch_args
from quodeq.dashboard.runner import run_dashboard
from tests.dashboard.test_dashboard_runner import TestHandoffToRunningInstance as _Handoff

# The code under test sets PYTHONUTF8 / QUODEQ_WEBVIEW_TOKEN for the process.
pytestmark = pytest.mark.usefixtures("restore_environ")


def test_round_trip_keeps_the_working_directory(tmp_path) -> None:
    record_launch_args(["--dev", "--evaluations", "./reports"], run_dir=tmp_path, cwd=tmp_path / "repo")
    record = read_launch_args(run_dir=tmp_path)
    assert record.args == ["--dev", "--evaluations", "./reports"]
    assert record.cwd == tmp_path / "repo"


def test_one_off_build_flags_are_not_repeated(tmp_path) -> None:
    record_launch_args(["--dev", "--reinstall"], run_dir=tmp_path)
    assert read_launch_args(run_dir=tmp_path).args == ["--dev"]


@pytest.mark.parametrize("content", ["", "not json", '["--dev"]', '{"args": ["--dev", 3]}'])
def test_unreadable_file_means_plain_launch(tmp_path, content) -> None:
    (tmp_path / LAUNCH_ARGS_FILE).write_text(content, encoding="utf-8")
    assert read_launch_args(run_dir=tmp_path) == LaunchRecord()


def test_missing_file_means_plain_launch(tmp_path) -> None:
    assert read_launch_args(run_dir=tmp_path) == LaunchRecord()


def test_dashboard_main_hands_its_flags_to_the_runner() -> None:
    run = MagicMock(return_value=0)
    with patch.object(dashboard_cli, "run_dashboard", run):
        assert dashboard_cli.main(["--dev", "--browser"]) == 0
    assert run.call_args.kwargs["launch_args"] == ["--dev", "--browser"]


def test_restart_reuses_the_recorded_flags_from_their_directory(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path.parent)  # monkeypatch undoes the chdir restart makes
    order = []
    record = LaunchRecord(args=["--dev"], cwd=tmp_path)
    with patch("quodeq.cli.read_launch_args", return_value=record), \
         patch("quodeq.cli.stop_dashboard", side_effect=lambda: order.append("stop")), \
         patch("quodeq.cli.dashboard_main", side_effect=lambda argv: order.append(argv) or 0), \
         patch("quodeq.cli.maybe_emit_cli_notice"):
        assert cli.main(["restart"]) == 0
    assert order == ["stop", ["--dev"]]
    assert Path.cwd() == tmp_path.resolve()


class TestLaunchArgs:
    """Only the process that starts the server records its flags for `quodeq restart`."""

    def test_recorded_on_a_cold_start(self, tmp_path, monkeypatch):
        instance = MagicMock()
        instance.probe_existing.return_value = False
        _calls, make_hooks = _Handoff._patch_launch_path(monkeypatch, instance)
        recorded = []
        monkeypatch.setattr(runner, "record_launch_args", recorded.append)
        config = _Handoff._config(tmp_path)
        run_dashboard(config, hooks=make_hooks(build_ui=lambda *a, **k: config.static_dist), launch_args=["--dev"])
        assert recorded == [["--dev"]]

    def test_not_recorded_when_handing_off_to_a_running_window(self, tmp_path, monkeypatch):
        instance = MagicMock()
        instance.probe_existing.return_value = True
        _calls, make_hooks = _Handoff._patch_launch_path(monkeypatch, instance)
        recorded = []
        monkeypatch.setattr(runner, "record_launch_args", recorded.append)
        config = _Handoff._config(tmp_path)
        run_dashboard(config, hooks=make_hooks(build_ui=lambda *a, **k: config.static_dist), launch_args=["--dev"])
        assert recorded == []
