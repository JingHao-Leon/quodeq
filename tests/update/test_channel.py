import sys

from quodeq.update import channel


def test_detect_channel_frozen(monkeypatch) -> None:
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert channel.detect_channel() == "frozen"


def test_detect_channel_wheel(monkeypatch) -> None:
    monkeypatch.delattr(sys, "frozen", raising=False)
    assert channel.detect_channel() == "wheel"


def test_upgrade_command_frozen_is_empty(monkeypatch) -> None:
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert channel.upgrade_command() == ""


def test_upgrade_command_pipx(monkeypatch) -> None:
    monkeypatch.delattr(sys, "frozen", raising=False)
    cmd = channel.upgrade_command(
        env={"PIPX_HOME": "/home/u/.local/pipx"},
        package_file="/home/u/.local/pipx/venvs/quodeq/lib/python3.12/site-packages/quodeq/__init__.py",
    )
    assert cmd == "pipx upgrade quodeq"


def test_upgrade_command_uv(monkeypatch) -> None:
    monkeypatch.delattr(sys, "frozen", raising=False)
    cmd = channel.upgrade_command(
        env={},
        package_file="/home/u/.local/share/uv/tools/quodeq/lib/python3.12/site-packages/quodeq/__init__.py",
    )
    assert cmd == "uv tool upgrade quodeq"


def test_upgrade_command_brew(monkeypatch) -> None:
    monkeypatch.delattr(sys, "frozen", raising=False)
    cmd = channel.upgrade_command(
        env={},
        package_file="/opt/homebrew/Cellar/quodeq/1.4.0/lib/python3.12/site-packages/quodeq/__init__.py",
    )
    assert cmd == "brew upgrade quodeq"


def test_upgrade_command_fallback(monkeypatch) -> None:
    monkeypatch.delattr(sys, "frozen", raising=False)
    cmd = channel.upgrade_command(env={}, package_file="/usr/lib/python3.12/site-packages/quodeq/__init__.py")
    assert cmd == "pip install -U quodeq"


def test_upgrade_argv_frozen_is_none(monkeypatch) -> None:
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert channel.upgrade_argv() is None


def test_upgrade_argv_uses_the_detected_tool(monkeypatch) -> None:
    monkeypatch.delattr(sys, "frozen", raising=False)
    argv = channel.upgrade_argv(
        env={},
        package_file="/opt/homebrew/Cellar/quodeq/1.4.0/lib/python3.12/site-packages/quodeq/__init__.py",
    )
    assert argv == ["brew", "upgrade", "quodeq"]


def test_upgrade_argv_pip_fallback_runs_this_interpreter(monkeypatch) -> None:
    monkeypatch.delattr(sys, "frozen", raising=False)
    argv = channel.upgrade_argv(
        env={},
        package_file="/usr/lib/python3.12/site-packages/quodeq/__init__.py",
        executable="/venv/bin/python",
    )
    assert argv == ["/venv/bin/python", "-m", "pip", "install", "-U", "quodeq"]
