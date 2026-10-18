"""keepRuns in GET /api/storage and PUT /api/storage/settings, beside the kept archiveAfterDays."""
from __future__ import annotations

import pytest
from flask import Flask

from quodeq.api.routes_storage import register_storage_routes
from tests.services._storage_fixtures import FakeProvider


@pytest.fixture
def client(tmp_path, monkeypatch):
    evals = tmp_path / "evals"
    evals.mkdir()
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "qdir"))
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_storage_routes(app, FakeProvider())
    return app.test_client()


@pytest.mark.parametrize("choice", [5, 10, 25, None])
def test_keep_runs_is_saved_and_read_back(client, choice):
    resp = client.put("/api/storage/settings", json={"keepRuns": choice})
    assert resp.status_code == 200
    assert resp.get_json()["keepRuns"] == choice
    assert client.get("/api/storage").get_json()["keepRuns"] == choice


def test_a_keep_runs_outside_the_choices_is_refused_and_the_saved_value_stays(client):
    client.put("/api/storage/settings", json={"keepRuns": 25})
    resp = client.put("/api/storage/settings", json={"keepRuns": 7})
    assert resp.status_code == 400 and resp.get_json()["code"] == "INVALID_VALUE"
    assert client.get("/api/storage").get_json()["keepRuns"] == 25


def test_saving_the_old_key_alone_leaves_keep_runs_alone(client):
    client.put("/api/storage/settings", json={"keepRuns": 5})
    resp = client.put("/api/storage/settings", json={"archiveAfterDays": 365})
    assert resp.status_code == 200
    body = client.get("/api/storage").get_json()
    assert (body["keepRuns"], body["archiveAfterDays"]) == (5, 365)
