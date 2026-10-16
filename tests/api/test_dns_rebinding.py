"""Without an API key only a loopback Host is served: a DNS-rebinding page names its own host."""
from http import HTTPStatus

import pytest

from quodeq.api.app import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("QUODEQ_API_KEY", raising=False)
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(tmp_path / "evaluations"))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    return create_app(static_dist=None, api_key=None).test_client()


@pytest.mark.parametrize("host", ["localhost:7866", "127.0.0.1:7866", "[::1]:7866", "localhost"])
def test_a_loopback_host_is_served(client, host):
    assert client.get("/api/projects", headers={"Host": host}).status_code == HTTPStatus.OK


def test_a_rebound_host_is_refused_for_reads_and_writes(client):
    host = "evil.example:7866"
    assert client.get("/api/projects", headers={"Host": host}).status_code == HTTPStatus.UNAUTHORIZED
    post = client.post("/api/standards/x/share", json={}, headers={"Host": host, "Origin": f"http://{host}"})
    assert post.status_code == HTTPStatus.UNAUTHORIZED
