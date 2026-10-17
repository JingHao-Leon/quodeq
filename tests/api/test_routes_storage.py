"""Contract tests for /api/storage: facts, setting, preview, clean now and delete all."""
from __future__ import annotations

import threading

import pytest
from flask import Flask

from quodeq.api import routes_storage
from quodeq.api.routes_storage import register_storage_routes
from quodeq.services import storage_cleanup, storage_job
from quodeq.services.storage_cleanup import CleanupResult
from quodeq.services.storage_job import CleanJob
from tests._timeouts import budget
from tests.services.test_storage_cleanup import _run
from tests.services.test_storage_report import _Provider


@pytest.fixture
def root(tmp_path, monkeypatch):
    evals = tmp_path / "evals"
    evals.mkdir()
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "qdir"))
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    return evals


@pytest.fixture
def provider():
    return _Provider()


@pytest.fixture
def client(root, provider):
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_storage_routes(app, provider)
    return app.test_client()


def _wait_state(client, state):
    pause = threading.Event()
    for _ in range(int(budget(10) / 0.01)):
        if client.get("/api/storage").get_json()["clean"]["state"] == state:
            return True
        pause.wait(0.01)
    return False


def test_get_storage_on_an_empty_root_is_zeros(client):
    resp = client.get("/api/storage")
    assert resp.status_code == 200
    assert resp.get_json() == {
        "bytes": 0, "runs": 0, "archived": 0, "projects": {}, "archiveAfterDays": 183,
        "clean": {"state": "idle", "done": 0, "total": 0, "archived": 0, "bytesFreed": 0},
    }


def test_get_storage_lists_projects(client, root):
    _run(root, "p", "r1", 300)
    gone = _run(root, "p", "r2", 200)
    (gone / "archive.tar.gz").write_bytes(b"a")
    body = client.get("/api/storage").get_json()
    assert (body["runs"], body["archived"]) == (2, 1)
    assert body["projects"]["p"]["runs"] == 2 and body["projects"]["p"]["archived"] == 1
    assert body["projects"]["p"]["bytes"] == body["bytes"] > 0


def test_put_settings_persists_every_choice(client):
    for choice in (91, 365, None, 183):
        resp = client.put("/api/storage/settings", json={"archiveAfterDays": choice})
        assert resp.status_code == 200
        assert resp.get_json() == {"archiveAfterDays": choice}
        assert client.get("/api/storage").get_json()["archiveAfterDays"] == choice


@pytest.mark.parametrize("body", [{"archiveAfterDays": 42}, {"archiveAfterDays": True}, {}, {"archiveAfterDays": "91"}])
def test_put_settings_rejects_other_values(client, body):
    resp = client.put("/api/storage/settings", json=body)
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "INVALID_VALUE"
    assert client.get("/api/storage").get_json()["archiveAfterDays"] == 183


def test_preview_uses_the_stored_setting(client, root):
    _run(root, "p", "old", 300)
    _run(root, "p", "newer", 10)
    assert client.get("/api/storage/preview").get_json()["archive"] == 1
    client.put("/api/storage/settings", json={"archiveAfterDays": None})
    assert client.get("/api/storage/preview").get_json() == {"archive": 0, "frees": 0}


def test_clean_starts_and_finishes(client, root):
    old = _run(root, "p", "old", 400)
    _run(root, "p", "newer", 10)
    resp = client.post("/api/storage/clean")
    assert resp.status_code == 202
    assert resp.get_json()["clean"]["state"] in ("running", "done")
    assert _wait_state(client, "done")
    assert (old / "archive.tar.gz").is_file()


def test_clean_is_409_while_the_startup_pass_runs(client):
    with storage_cleanup.CLEANUP_LOCK:
        resp = client.post("/api/storage/clean")
    assert resp.status_code == 409
    assert resp.get_json()["code"] == "STORAGE_BUSY"


def test_clean_is_409_while_a_clean_runs(client, monkeypatch):
    release = threading.Event()
    monkeypatch.setattr(storage_job, "run_cleanup", lambda *a, **k: release.wait(budget(10)) and CleanupResult(0, 0, 0))
    assert client.post("/api/storage/clean").status_code == 202
    assert client.post("/api/storage/clean").status_code == 409
    release.set()
    assert _wait_state(client, "done")


def test_delete_all_needs_confirmation(client, root, provider):
    _run(root, "p", "r", 10)
    resp = client.delete("/api/storage")
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "CONFIRMATION_REQUIRED"
    assert provider.deleted == []


def test_delete_all_deletes_every_project(client, root, provider):
    _run(root, "p", "r", 10)
    _run(root, "q", "r", 10)
    resp = client.delete("/api/storage?confirm=true")
    assert resp.status_code == 200
    assert resp.get_json() == {"deleted": 2}
    assert client.get("/api/storage").get_json()["runs"] == 0


def test_delete_all_is_409_while_a_run_is_in_flight(client, root, provider):
    _run(root, "p", "live", 1, state="running")
    resp = client.delete("/api/storage?confirm=true")
    assert resp.status_code == 409 and resp.get_json()["code"] == "STORAGE_BUSY"
    assert provider.deleted == []


def test_delete_all_is_409_during_the_score_warmup(client, root, provider, monkeypatch):
    _run(root, "p", "r", 10)

    class _Busy:
        def snapshot(self):
            return {"active": True}

    monkeypatch.setattr(routes_storage, "warmup_engine", _Busy())
    assert client.delete("/api/storage?confirm=true").status_code == 409
    assert provider.deleted == []


def test_the_app_registers_the_storage_routes(root):
    from quodeq.api.app import create_app
    from tests.api.test_action_api import StubProvider
    app = create_app(StubProvider())
    assert isinstance(app.extensions["storage_clean"], CleanJob)
    assert app.test_client().get("/api/storage").status_code == 200
    app.extensions["grade_formula_rescore"].stop()
