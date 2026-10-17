from unittest.mock import patch

import pytest
from flask import Flask

from quodeq.api.routes_update import register_update_routes


@pytest.fixture()
def client():
    app = Flask(__name__)
    register_update_routes(app)
    return app.test_client()


_STATUS = {"current": "1.4.0", "latest": "1.5.0", "update_available": True}


def test_get_status(client) -> None:
    with patch("quodeq.api.routes_update.get_status", return_value=_STATUS), \
         patch("quodeq.api.routes_update.check_async"):
        resp = client.get("/api/update/status")
    assert resp.status_code == 200
    assert resp.get_json()["latest"] == "1.5.0"


def test_post_check_forces(client) -> None:
    with patch("quodeq.api.routes_update.run_check") as run, \
         patch("quodeq.api.routes_update.get_status", return_value=_STATUS):
        resp = client.post("/api/update/check")
    assert resp.status_code == 200
    run.assert_called_once_with(force=True)


def test_post_dismiss_requires_version(client) -> None:
    resp = client.post("/api/update/dismiss", json={})
    assert resp.status_code == 400


def test_post_dismiss_ok(client) -> None:
    with patch("quodeq.api.routes_update.dismiss") as dis, \
         patch("quodeq.api.routes_update.get_status", return_value=_STATUS):
        resp = client.post("/api/update/dismiss", json={"version": "1.5.0"})
    assert resp.status_code == 200
    dis.assert_called_once_with("1.5.0")


def test_post_selfupdate_starts(client) -> None:
    result = {"ok": True, "status": _STATUS}
    with patch("quodeq.api.routes_update.begin_self_update", return_value=result), \
         patch("quodeq.api.routes_update.get_status", return_value=_STATUS):
        resp = client.post("/api/update/selfupdate")
    assert resp.status_code == 200
    assert resp.get_json()["status"]["latest"] == "1.5.0"


def test_post_selfupdate_unsupported_409(client) -> None:
    result = {
        "ok": False,
        "code": "UNSUPPORTED",
        "error": "self-update is not supported here",
        "reason": "no_team_id",
    }
    with patch("quodeq.api.routes_update.begin_self_update", return_value=result):
        resp = client.post("/api/update/selfupdate")
    assert resp.status_code == 409
    assert resp.get_json()["reason"] == "no_team_id"


def test_post_selfupdate_no_update_409(client) -> None:
    result = {"ok": False, "code": "NO_UPDATE", "error": "no update available"}
    with patch("quodeq.api.routes_update.begin_self_update", return_value=result):
        resp = client.post("/api/update/selfupdate")
    assert resp.status_code == 409
    assert resp.get_json()["code"] == "NO_UPDATE"


def test_post_selfupdate_busy_409(client) -> None:
    result = {"ok": False, "code": "BUSY", "error": "self-update already running"}
    with patch("quodeq.api.routes_update.begin_self_update", return_value=result):
        resp = client.post("/api/update/selfupdate")
    assert resp.status_code == 409
    assert resp.get_json()["code"] == "BUSY"


def test_post_settings_toggles(client) -> None:
    with patch("quodeq.api.routes_update.set_settings") as setn, \
         patch("quodeq.api.routes_update.get_status", return_value=_STATUS):
        resp = client.post("/api/update/settings", json={"auto_check_enabled": False, "disclosed": True})
    assert resp.status_code == 200
    setn.assert_called_once_with(auto_check_enabled=False, disclosed=True)


_IN_PLACE = {"supported": True, "reason": None, "phase": "idle"}
_LOCAL = {"REMOTE_ADDR": "127.0.0.1"}
_REMOTE = {"REMOTE_ADDR": "10.0.0.5"}


def _status_with_in_place():
    return {**_STATUS, "in_place_upgrade": dict(_IN_PLACE)}


def test_status_reports_running_evaluations(client) -> None:
    with patch("quodeq.api.routes_update.get_status", return_value=_status_with_in_place()), \
         patch("quodeq.api.routes_update.check_async"), \
         patch("quodeq.api.routes_update._evaluations_running", return_value=2):
        body = client.get("/api/update/status", environ_base=_LOCAL).get_json()
    assert body["in_place_upgrade"]["supported"] is True
    assert body["in_place_upgrade"]["evaluations_running"] == 2


def test_status_hides_in_place_upgrade_from_remote_callers(client) -> None:
    with patch("quodeq.api.routes_update.get_status", return_value=_status_with_in_place()), \
         patch("quodeq.api.routes_update.check_async"):
        body = client.get("/api/update/status", environ_base=_REMOTE).get_json()
    assert body["in_place_upgrade"]["supported"] is False
    assert body["in_place_upgrade"]["reason"] == "remote"


def test_upgrade_refused_for_remote_callers(client) -> None:
    with patch("quodeq.api.routes_update.begin_in_place_upgrade") as begin:
        resp = client.post("/api/update/upgrade", environ_base=_REMOTE)
    assert resp.status_code == 403
    begin.assert_not_called()


def test_upgrade_refused_while_evaluations_run(client) -> None:
    with patch("quodeq.api.routes_update._evaluations_running", return_value=1), \
         patch("quodeq.api.routes_update.begin_in_place_upgrade") as begin:
        resp = client.post("/api/update/upgrade", environ_base=_LOCAL)
    assert resp.status_code == 409
    assert resp.get_json()["code"] == "EVALUATIONS_RUNNING"
    begin.assert_not_called()


def test_upgrade_starts(client) -> None:
    with patch("quodeq.api.routes_update._evaluations_running", return_value=0), \
         patch("quodeq.api.routes_update.begin_in_place_upgrade", return_value={"ok": True}), \
         patch("quodeq.api.routes_update.get_status", return_value=_status_with_in_place()):
        resp = client.post("/api/update/upgrade", environ_base=_LOCAL)
    assert resp.status_code == 200
    assert resp.get_json()["ok"] is True


def test_restart_needs_a_finished_upgrade(client) -> None:
    with patch("quodeq.api.routes_update.inplace.restart", return_value=False):
        resp = client.post("/api/update/restart", environ_base=_LOCAL)
    assert resp.status_code == 409


def test_restart_refused_for_remote_callers(client) -> None:
    with patch("quodeq.api.routes_update.inplace.restart") as restart:
        resp = client.post("/api/update/restart", environ_base=_REMOTE)
    assert resp.status_code == 403
    restart.assert_not_called()


def test_restart_spawns(client) -> None:
    with patch("quodeq.api.routes_update.inplace.restart", return_value=True):
        resp = client.post("/api/update/restart", environ_base=_LOCAL)
    assert resp.status_code == 200


def test_selfupdate_refused_for_remote_callers(client) -> None:
    with patch("quodeq.api.routes_update.begin_self_update") as begin:
        resp = client.post("/api/update/selfupdate", environ_base=_REMOTE)
    assert resp.status_code == 403
    begin.assert_not_called()
