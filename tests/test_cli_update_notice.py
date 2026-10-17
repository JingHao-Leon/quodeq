import io
from unittest.mock import patch

import pytest

from quodeq import cli


class _TTY(io.StringIO):
    def isatty(self) -> bool:  # pretend we're an interactive terminal
        return True


def test_notice_prints_when_update_available() -> None:
    stream = _TTY()
    status = {"update_available": True, "current": "1.4.0", "latest": "1.5.0",
              "action_command": "pipx upgrade quodeq", "is_security": False, "disclosed": True}
    with patch("quodeq.cli.get_status", return_value=status), \
         patch("quodeq.cli.check_async"):
        cli.maybe_emit_cli_notice(stream=stream, env={})
    out = stream.getvalue()
    assert "1.5.0" in out and "pipx upgrade quodeq" in out


def test_no_notice_when_not_a_tty() -> None:
    stream = io.StringIO()  # isatty() -> False
    status = {"update_available": True, "current": "1.4.0", "latest": "1.5.0",
              "action_command": "x", "is_security": False, "disclosed": True}
    with patch("quodeq.cli.get_status", return_value=status), patch("quodeq.cli.check_async"):
        cli.maybe_emit_cli_notice(stream=stream, env={})
    assert stream.getvalue() == ""


def test_skipped_when_opted_out() -> None:
    stream = _TTY()
    status = {"update_available": True, "current": "1.4.0", "latest": "1.5.0",
              "action_command": "x", "is_security": False, "disclosed": True}
    with patch("quodeq.cli.get_status", return_value=status), patch("quodeq.cli.check_async"):
        cli.maybe_emit_cli_notice(stream=stream, env={"QUODEQ_NO_UPDATE_NOTIFIER": "1"})
    assert stream.getvalue() == ""


class _BrokenPipe(io.StringIO):
    """A stream whose write() fails like a closed stdout pipe would."""

    def isatty(self) -> bool:
        return True

    def write(self, _s: str) -> int:
        raise BrokenPipeError("write failed")


def test_broken_pipe_during_print_is_swallowed() -> None:
    stream = _BrokenPipe()
    status = {"update_available": True, "current": "1.4.0", "latest": "1.5.0",
              "action_command": "pipx upgrade quodeq", "is_security": False, "disclosed": True}
    with patch("quodeq.cli.get_status", return_value=status), \
         patch("quodeq.cli.check_async"):
        cli.maybe_emit_cli_notice(stream=stream, env={})  # must not raise


class _NonUtf8Stream(io.StringIO):
    """A stream whose write() fails like stdout would if it couldn't be
    reconfigured to UTF-8 and the "→" glyph can't be encoded."""

    def isatty(self) -> bool:
        return True

    def write(self, s: str) -> int:
        if "→" in s:  # "→"
            raise UnicodeEncodeError("ascii", s, s.index("→"), s.index("→") + 1, "ordinal not in range(128)")
        return len(s)


def test_unicode_encode_error_during_print_is_swallowed() -> None:
    stream = _NonUtf8Stream()
    status = {"update_available": True, "current": "1.4.0", "latest": "1.5.0",
              "action_command": "pipx upgrade quodeq", "is_security": False, "disclosed": True}
    with patch("quodeq.cli.get_status", return_value=status), \
         patch("quodeq.cli.check_async"):
        cli.maybe_emit_cli_notice(stream=stream, env={})  # must not raise


def test_disclosure_prints_once_then_marks() -> None:
    stream = _TTY()
    status = {"update_available": False, "current": "1.4.0", "latest": None,
              "action_command": "x", "is_security": False, "disclosed": False}
    with patch("quodeq.cli.get_status", return_value=status), \
         patch("quodeq.cli.check_async"), \
         patch("quodeq.cli.set_settings") as setn:
        cli.maybe_emit_cli_notice(stream=stream, env={})
    assert "checks" in stream.getvalue().lower()
    setn.assert_called_once_with(disclosed=True)


def test_upgrade_subcommand_dispatches_without_notice(restore_environ) -> None:
    with patch("quodeq.update.upgrade.run_upgrade", return_value=0) as run_upgrade, \
         patch("quodeq.cli.maybe_emit_cli_notice") as notice:
        assert cli.main(["upgrade", "--dry-run"]) == 0
    run_upgrade.assert_called_once_with(dry_run=True)
    notice.assert_not_called()


def test_upgrade_rejects_unknown_flags(restore_environ) -> None:
    with patch("quodeq.update.upgrade.run_upgrade") as run_upgrade, \
         pytest.raises(SystemExit) as exc:
        cli.main(["upgrade", "--dryrun"])
    assert exc.value.code == 2
    run_upgrade.assert_not_called()


def test_restart_stops_then_launches(restore_environ) -> None:
    order = []
    with patch("quodeq.cli.stop_dashboard", side_effect=lambda: order.append("stop")), \
         patch("quodeq.cli.dashboard_main", side_effect=lambda argv: order.append("launch") or 0), \
         patch("quodeq.cli.maybe_emit_cli_notice"):
        assert cli.main(["restart"]) == 0
    assert order == ["stop", "launch"]
