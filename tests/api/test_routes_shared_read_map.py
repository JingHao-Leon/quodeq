"""GET /api/shared/projects/<project>/map/history: the Map's history from the shared clone."""
from __future__ import annotations

from quodeq.data.fs.shared_repo import shared_evaluations_root
from tests.api._routes_shared_read_fixtures import (  # noqa: F401 -- pytest fixtures
    app,
    client,
)
from tests.services._map_history_fixtures import DIMS, violation, write_run


def test_shared_map_history_serves_the_clones_runs(client, shared_clone_fixture):
    root = shared_evaluations_root(shared_clone_fixture)
    for run_id, day in (("m1", "2026-09-01"), ("m2", "2026-09-08")):
        write_run(root / "proj-m", run_id, day, {"security": [violation("a.py")]}, dims=DIMS)
    body = client.get("/api/shared/projects/proj-m/map/history").get_json()
    assert body["days"] == ["2026-09-01", "2026-09-08"] and body["fileNames"] == ["a.py"]


def test_shared_map_history_of_an_unknown_project_is_empty(client, shared_clone_fixture):
    body = client.get("/api/shared/projects/does-not-exist/map/history").get_json()
    assert body["days"] == [] and body["frames"] == []


def test_shared_map_history_rejects_a_bad_frames_value(client, shared_clone_fixture):
    assert client.get("/api/shared/projects/proj-a/map/history?frames=some").status_code == 400


def test_shared_map_history_invalid_segment(client, shared_clone_fixture):
    assert client.get("/api/shared/projects/%2e%2e/map/history").status_code == 400


def test_shared_map_history_409_when_unconfigured(client, monkeypatch, tmp_path):
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path))
    assert client.get("/api/shared/projects/x/map/history").status_code == 409
