"""The /estimates route resolves the project's settings file read-only.

The analysis layer no longer imports the data-layer resolver; the route
resolves the file (never migrating legacy repo files) and passes it in.
"""
from __future__ import annotations

import json

import pytest

from quodeq.analysis import estimates
from tests.api._routes_project_list_fixtures import (  # noqa: F401 -- app/client/provider are pytest fixtures
    app,
    client,
    provider,
)


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_CACHE_ROOT", str(tmp_path / "cache"))
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "home"))


def test_estimates_route_passes_the_settings_file_and_never_migrates(client, tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    (repo / ".quodeq").mkdir(parents=True)
    (repo / ".quodeq" / "standards-overrides.json").write_text(
        json.dumps({"version": 1, "overrides": {"M-MOD-1": {"max_complexity": 30}}}))
    for name in ("a.py", "b.py", "c.py"):
        (repo / name).write_text(f"# {name}\n")
    proj = tmp_path / "my-proj"
    proj.mkdir()
    (proj / "repository_info.json").write_text(
        json.dumps({"name": "my-proj", "location": "local", "path": str(repo)}))
    seen = []
    monkeypatch.setattr(estimates, "compute_dim_estimates",
                        lambda config, dims, count_only=False: seen.append(config) or {})

    resp = client.get("/api/projects/my-proj/estimates?dimensions=maintainability")

    assert resp.status_code == 200
    expected = tmp_path / "home" / "projects" / "my-proj" / "standards.json"
    assert [c.standards_settings for c in seen] == [expected]
    assert not expected.exists()
