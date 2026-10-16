"""The /tmp llama-server log is streamed only when it is the user's own regular file."""
from __future__ import annotations

import sys

import pytest

_ROUTES = "quodeq.api._llamacpp_log_routes"


@pytest.fixture()
def shared_tmp_log(tmp_path, monkeypatch):
    """Point the /tmp fallback at a file under tmp_path and probe only it."""
    shared = tmp_path / "llama-server.log"
    monkeypatch.delenv("LLAMACPP_LOG_FILE", raising=False)
    monkeypatch.setattr(f"{_ROUTES}._SHARED_TMP_LOG", shared)
    monkeypatch.setattr(f"{_ROUTES}._default_log_paths", lambda env=None: [shared])
    return shared


@pytest.fixture()
def client():
    from quodeq.api.app import create_app
    app = create_app(test_config={"TESTING": True})
    with app.test_client() as c:
        yield c


def _available(client) -> bool:
    return client.get("/api/llamacpp/logs/available").get_json()["available"]


def test_shared_tmp_log_used_when_it_is_our_own_file(shared_tmp_log, client):
    shared_tmp_log.write_text("ready\n", encoding="utf-8")
    assert _available(client) is True


@pytest.mark.skipif(sys.platform == "win32", reason="creating symlinks needs privileges on Windows")
def test_shared_tmp_log_ignored_when_it_is_a_symlink(shared_tmp_log, tmp_path, client):
    target = tmp_path / "someone-elses.log"
    target.write_text("private\n", encoding="utf-8")
    shared_tmp_log.symlink_to(target)
    assert _available(client) is False
