import subprocess
import sys

import pytest

from quodeq.update import inplace

_SITE = "/home/u/.local/pipx/venvs/quodeq/lib/python3.12/site-packages/quodeq/__init__.py"
_EDITABLE = "/home/u/src/quodeq/src/quodeq/__init__.py"
_PIP_SITE = "/venv/lib/python3.12/site-packages/quodeq/__init__.py"


@pytest.fixture(autouse=True)
def _wheel(monkeypatch):
    monkeypatch.delattr(sys, "frozen", raising=False)
    inplace._reset_for_tests()
    yield
    inplace._reset_for_tests()


def _found(name):
    return "/bin/" + name


def test_frozen_is_unsupported(monkeypatch) -> None:
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert inplace.unsupported_reason(env={}, which=_found) == inplace.REASON_FROZEN


def test_editable_checkout_is_unsupported() -> None:
    assert inplace.unsupported_reason(env={}, package_file=_EDITABLE, which=_found) == inplace.REASON_EDITABLE


def test_missing_tool_is_unsupported() -> None:
    reason = inplace.unsupported_reason(env={}, package_file=_SITE, which=lambda name: None)
    assert reason == inplace.REASON_NO_TOOL


def test_pipx_install_is_supported() -> None:
    assert inplace.unsupported_reason(env={}, package_file=_SITE, which=_found) is None


def test_pip_into_a_system_python_is_unsupported(monkeypatch) -> None:
    monkeypatch.setattr(inplace, "_externally_managed", lambda: True)
    reason = inplace.unsupported_reason(env={}, package_file=_PIP_SITE, which=_found)
    assert reason == inplace.REASON_EXTERNALLY_MANAGED


def test_pip_into_a_read_only_env_is_unsupported(monkeypatch) -> None:
    monkeypatch.setattr(inplace, "_externally_managed", lambda: False)
    monkeypatch.setattr(inplace.os, "access", lambda path, mode: False)
    reason = inplace.unsupported_reason(env={}, package_file=_PIP_SITE, which=_found)
    assert reason == inplace.REASON_NOT_WRITABLE


def _fake_run(returncode, stdout="", stderr=""):
    def run(argv, **_kwargs):
        return subprocess.CompletedProcess(argv, returncode, stdout, stderr)
    return run


def test_successful_upgrade_reaches_installed() -> None:
    assert inplace.start("9.9.9", env={}, run=_fake_run(0, "Successfully installed"))
    inplace._join_for_tests()
    state = inplace.describe(env={})
    assert state["phase"] == inplace.PHASE_INSTALLED
    assert state["version"] == "9.9.9"
    assert "Successfully installed" in state["output"]


def test_failed_upgrade_keeps_the_output() -> None:
    inplace.start("9.9.9", env={}, run=_fake_run(1, stderr="No space left"))
    inplace._join_for_tests()
    state = inplace.describe(env={})
    assert state["phase"] == inplace.PHASE_ERROR
    assert "exited with code 1" in state["error"]
    assert "No space left" in state["output"]


def test_timeout_is_an_error_and_keeps_the_output() -> None:
    def run(argv, **_kwargs):
        raise subprocess.TimeoutExpired(argv, 1, output=b"Building wheel")
    inplace.start("9.9.9", env={}, run=run)
    inplace._join_for_tests()
    state = inplace.describe(env={})
    assert state["phase"] == inplace.PHASE_ERROR
    assert "Building wheel" in state["output"]


def test_no_second_start_after_success() -> None:
    inplace.start("9.9.9", env={}, run=_fake_run(0))
    inplace._join_for_tests()
    assert inplace.start("9.9.9", env={}, run=_fake_run(0)) is False


def test_a_failed_upgrade_can_be_retried() -> None:
    inplace.start("9.9.9", env={}, run=_fake_run(1))
    inplace._join_for_tests()
    assert inplace.start("9.9.9", env={}, run=_fake_run(0)) is True


def test_restart_only_after_an_upgrade() -> None:
    calls = []
    assert inplace.restart(env={}, popen=lambda *a, **k: calls.append(a)) is False
    assert calls == []


def test_restart_spawns_quodeq_restart_without_stale_env() -> None:
    inplace.start("9.9.9", env={}, run=_fake_run(0))
    inplace._join_for_tests()
    calls = []
    env = {"QUODEQ_STATIC_DIST": "/old/keg/static", "HOME": "/home/u"}
    assert inplace.restart(env=env, popen=lambda argv, **k: calls.append((argv, k)), which=_found)
    argv, kwargs = calls[0]
    assert argv[-1] == "restart"
    assert "QUODEQ_STATIC_DIST" not in kwargs["env"]
    assert kwargs["env"]["HOME"] == "/home/u"
