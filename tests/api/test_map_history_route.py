import json
from http import HTTPStatus

import pytest

from quodeq.api.app import create_app


@pytest.fixture(autouse=True)
def _no_auth(monkeypatch):
    monkeypatch.delenv("QUODEQ_API_KEY", raising=False)


@pytest.fixture
def client(tmp_path, monkeypatch):
    evals = tmp_path / "evaluations"
    for run_id, day in (("r1", "2026-09-01"), ("r2", "2026-09-08")):
        ev = evals / "proj" / run_id / "evaluation"
        ev.mkdir(parents=True)
        ev.joinpath("security.json").write_text(json.dumps({"dimension": "security", "date": f"{day}T10:00:00+00:00", "principles": [],
            "violations": [{"req": "R1", "file": "a.py", "line": 1, "snippet": "x()", "severity": "major"}], "compliance": []}))
        (evals / "proj" / run_id / "status.json").write_text(json.dumps({"state": "done", "started_at": f"{day}T10:00:00Z"}))
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    return create_app(static_dist=None, api_key=None).test_client()


def test_latest_by_default(client):
    body = client.get("/api/projects/proj/map/history").get_json()
    assert body["days"] == ["2026-09-01", "2026-09-08"] and len(body["frames"]) == 1


def test_all_frames(client):
    assert len(client.get("/api/projects/proj/map/history?frames=all").get_json()["frames"]) == 2


def test_bad_frames_value_is_400(client):
    assert client.get("/api/projects/proj/map/history?frames=some").status_code == HTTPStatus.BAD_REQUEST


def test_bad_segment_is_400(client):
    assert client.get("/api/projects/a%5Cb/map/history").status_code == HTTPStatus.BAD_REQUEST


@pytest.fixture
def locked_db(monkeypatch):
    import sqlite3

    def boom(*_a, **_k):
        raise sqlite3.OperationalError("locked")

    monkeypatch.setattr("quodeq.api.routes_map_history.build_map_history", boom)


@pytest.mark.usefixtures("locked_db")
def test_database_error_is_500(client):
    assert client.get("/api/projects/proj/map/history").status_code == HTTPStatus.INTERNAL_SERVER_ERROR


@pytest.mark.usefixtures("locked_db")
def test_database_error_says_internal_error(client):
    assert client.get("/api/projects/proj/map/history").get_json()["code"] == "INTERNAL_ERROR"
