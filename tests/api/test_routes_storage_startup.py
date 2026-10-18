"""The startup cleanup runs through the app's clean job: visible in GET /api/storage/clean, and clean now is busy."""
from __future__ import annotations

import threading

import pytest
from flask import Flask

from quodeq.api import app as app_module
from quodeq.api.routes_storage import register_storage_routes
from quodeq.services import storage_cleanup, storage_job
from quodeq.services.storage_cleanup import CleanupResult
from tests._timeouts import budget
from tests.services._storage_fixtures import FakeProvider

_LOCALHOST = {"Origin": "http://localhost"}


@pytest.fixture
def app(tmp_path, monkeypatch):
    evals = tmp_path / "evals"
    evals.mkdir()
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "qdir"))
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    flask_app = Flask(__name__)
    register_storage_routes(flask_app, FakeProvider())
    return flask_app


def _wait(client, state) -> bool:
    pause = threading.Event()
    for _ in range(int(budget(10) / 0.01)):
        if client.get("/api/storage/clean").get_json()["clean"]["state"] == state:
            return True
        pause.wait(0.01)
    return False


def test_the_startup_pass_shows_as_running_and_clean_now_is_busy(app, tmp_path, monkeypatch):
    release, entered = threading.Event(), threading.Event()

    def slow(*_a, hooks=None, **_k):
        hooks.on_progress(1, 4)
        entered.set()
        release.wait(budget(10))
        return CleanupResult(1, 0, 0)

    monkeypatch.setattr(storage_job, "run_cleanup", slow)
    client = app.test_client()
    job = app.extensions["storage_clean"]
    thread = storage_cleanup.start_storage_cleanup(tmp_path / "evals", {"QUODEQ_DIR": str(tmp_path / "qdir")}, start_pass=job.start)
    try:
        thread.join(budget(10))
        assert entered.wait(budget(10))
        clean = client.get("/api/storage/clean").get_json()["clean"]
        assert (clean["state"], clean["done"], clean["total"]) == ("running", 1, 4)
        busy = client.post("/api/storage/clean", headers=_LOCALHOST)
        assert busy.status_code == 409 and busy.get_json()["code"] == "STORAGE_BUSY"
    finally:
        release.set()
    assert _wait(client, "done")


def test_background_work_hands_the_app_job_to_the_startup_cleanup(app, monkeypatch):
    seen = {}
    monkeypatch.setattr("quodeq.services.warmup.engine.start", lambda *_a: None)
    monkeypatch.setattr("quodeq.services.cache_maintenance.start_cache_maintenance", lambda **_k: None)
    monkeypatch.setattr(storage_cleanup, "start_storage_cleanup", lambda *a, **k: seen.update(k))

    app_module._start_background_work(app, {})

    assert seen["start_pass"] == app.extensions["storage_clean"].start
