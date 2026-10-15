"""set_dock_display_name: best-effort LaunchServices rename of the webview process."""
from __future__ import annotations

import ctypes

from quodeq.dashboard import dock_name as dock


class _Fn:
    """A ctypes-function stand-in that records calls and returns a fixed value."""

    def __init__(self, result: object) -> None:
        self.result = result
        self.calls: list[tuple] = []

    def __call__(self, *args: object) -> object:
        self.calls.append(args)
        return self.result


class _FakeLS:
    def __init__(self, asn: int | None, status: int = 0) -> None:
        self._LSGetCurrentApplicationASN = _Fn(asn)
        self._LSSetApplicationInformationItem = _Fn(status)


class _FakeCF:
    def __init__(self) -> None:
        self.CFStringCreateWithCString = _Fn(0xBEEF)
        self.CFRelease = _Fn(None)


def _install(monkeypatch, ls: _FakeLS, cf: _FakeCF) -> list[str]:
    monkeypatch.setattr(dock, "_load_launch_services", lambda: (ls, cf))
    monkeypatch.setattr(ctypes.c_void_p, "in_dll", classmethod(lambda cls, lib, name: cls(0xCAFE)))
    messages: list[str] = []
    monkeypatch.setattr(dock, "log_debug", messages.append)
    return messages


def test_sets_display_name_and_releases_the_string(monkeypatch) -> None:
    ls, cf = _FakeLS(asn=0x1234), _FakeCF()
    messages = _install(monkeypatch, ls, cf)
    dock.set_dock_display_name("quodeq")
    assert cf.CFStringCreateWithCString.calls[0][1] == b"quodeq"
    assert ls._LSSetApplicationInformationItem.calls == [(-2, 0x1234, 0xCAFE, 0xBEEF, None)]
    assert cf.CFRelease.calls == [(0xBEEF,)]
    assert messages == []


def test_unregistered_process_is_left_alone(monkeypatch) -> None:
    ls, cf = _FakeLS(asn=None), _FakeCF()
    messages = _install(monkeypatch, ls, cf)
    dock.set_dock_display_name("quodeq")
    assert ls._LSSetApplicationInformationItem.calls == []
    assert any("not registered" in m for m in messages)


def test_nonzero_status_is_logged(monkeypatch) -> None:
    messages = _install(monkeypatch, _FakeLS(asn=0x1234, status=-50), _FakeCF())
    dock.set_dock_display_name("quodeq")
    assert any("status -50" in m for m in messages)


def test_missing_launch_services_is_logged_not_raised(monkeypatch) -> None:
    def _boom() -> None:
        raise OSError("no CoreServices")

    monkeypatch.setattr(dock, "_load_launch_services", _boom)
    messages: list[str] = []
    monkeypatch.setattr(dock, "log_debug", messages.append)
    dock.set_dock_display_name("quodeq")
    assert any("LaunchServices unavailable" in m for m in messages)
