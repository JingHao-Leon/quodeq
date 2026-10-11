"""GET /api/projects/<project>/runs/log serves the History run log."""
from __future__ import annotations

import json
from http import HTTPStatus
from pathlib import Path

import pytest

from quodeq.api.app import create_app

_PROJECT = "proj"
_PREV = "run-prev"
_CURR = "run-curr"
_DIM = "maintainability"


@pytest.fixture(autouse=True)
def _no_auth(monkeypatch):
    monkeypatch.delenv("QUODEQ_API_KEY", raising=False)


def _report(run_dir: Path, violations: list[dict], started_at: str) -> None:
    (run_dir / "evaluation").mkdir(parents=True, exist_ok=True)
    (run_dir / "evaluation" / f"{_DIM}.json").write_text(json.dumps({
        "dimension": _DIM, "principles": [], "violations": violations, "compliance": [],
    }), encoding="utf-8")
    (run_dir / "status.json").write_text(json.dumps({
        "state": "done", "started_at": started_at}), encoding="utf-8")


@pytest.fixture
def client(tmp_path, monkeypatch):
    evals = tmp_path / "evaluations"
    _report(evals / _PROJECT / _PREV,
            [{"req": "M-REU-1", "file": "b.py", "line": 2, "snippet": "dup()", "severity": "minor"}],
            "2026-09-20T00:00:00Z")
    _report(evals / _PROJECT / _CURR,
            [{"req": "M-ANA-9", "file": "a.py", "line": 5, "snippet": "long", "severity": "minor"}],
            "2026-09-26T00:00:00Z")
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    app = create_app(static_dist=None, api_key=None)
    return app.test_client()


def test_run_log_route_returns_runs_newest_first(client) -> None:
    resp = client.get(f"/api/projects/{_PROJECT}/runs/log")
    assert resp.status_code == HTTPStatus.OK
    body = resp.get_json()
    assert [r["runId"] for r in body["runs"]] == [_CURR, _PREV]
    assert body["runs"][0]["baselineRunId"] == _PREV
    assert body["running"] is None


def test_run_log_route_rejects_a_bad_segment(client) -> None:
    assert client.get("/api/projects/a%5Cb/runs/log").status_code == HTTPStatus.BAD_REQUEST


def test_run_log_route_unknown_project_is_an_empty_log(client) -> None:
    assert client.get("/api/projects/nope/runs/log").get_json() == {"runs": [], "running": None}
