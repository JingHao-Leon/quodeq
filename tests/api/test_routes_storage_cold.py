"""coldAfterDays on the storage API, and the trim count in the preview, the notice and the clean snapshot."""
from __future__ import annotations

import json

import pytest
from flask import Flask

from quodeq.api.routes_storage import register_storage_routes
from quodeq.core.observability import NULL_LOG
from quodeq.services.storage_cleanup import archive_keeping_keys
from quodeq.services.storage_settings import storage_settings_path
from tests.services._archive_fixtures import make_run
from tests.services._storage_fixtures import FakeProvider


@pytest.fixture
def root(tmp_path, monkeypatch):
    evals = tmp_path / "evals"
    evals.mkdir()
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "qdir"))
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "qdir" / "score_cache.db"))
    return evals


@pytest.fixture
def client(root):
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_storage_routes(app, FakeProvider())
    return app.test_client()


def _settings(**values):
    path = storage_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(values))


@pytest.mark.parametrize("choice", [91, 183, 365, None])
def test_cold_after_days_round_trips(client, choice):
    resp = client.put("/api/storage/settings", json={"coldAfterDays": choice})
    assert resp.status_code == 200 and resp.get_json()["coldAfterDays"] == choice
    assert client.get("/api/storage").get_json()["coldAfterDays"] == choice


def test_a_cold_after_days_outside_the_choices_is_refused(client):
    client.put("/api/storage/settings", json={"coldAfterDays": 365})
    resp = client.put("/api/storage/settings", json={"coldAfterDays": 42})
    assert resp.status_code == 400 and resp.get_json()["code"] == "INVALID_VALUE"
    assert client.get("/api/storage").get_json()["coldAfterDays"] == 365


def test_the_preview_and_the_notice_report_trim_work(client, root):
    old = make_run(root, "run-old", days=400)
    make_run(root, "run-new", days=10)
    archive_keeping_keys(old, NULL_LOG)
    _settings(keep_runs=5, cold_after_days=91, keep_notice="pending")
    preview = client.get("/api/storage/preview").get_json()
    notice = client.get("/api/storage").get_json()["archiveNotice"]
    assert (preview["archive"], preview["pack"], preview["trim"]) == (0, 0, 1) and preview["frees"] > 0
    assert notice["trim"] == 1 and notice["bytes"] == preview["frees"]
    assert client.get("/api/storage/clean").get_json()["clean"]["trimmed"] == 0
