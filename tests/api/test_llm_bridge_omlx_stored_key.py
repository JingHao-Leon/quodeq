"""The oMLX routes use the keychain key only for the default server."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from quodeq.api import llm_bridge_routes

_REAL_OMLX_KEY = llm_bridge_routes._omlx_key

_TEST_API_KEY = "sk-test"


@pytest.fixture()
def client():
    from quodeq.api.app import create_app
    app = create_app(test_config={"TESTING": True})
    with app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def _real_fallback(monkeypatch):
    # tests/api/conftest.py stubs the fallback out for every other api test.
    monkeypatch.setattr(llm_bridge_routes, "_omlx_key", _REAL_OMLX_KEY)


class TestOmlxStoredKeyFallback:
    """Once the key lives in the keychain the UI sends none; the routes use it."""

    def test_models_route_uses_stored_key_when_header_missing(self, client):
        with patch("quodeq.api.llm_bridge_routes.get_api_key_secure", return_value=_TEST_API_KEY), \
             patch("quodeq.api.llm_bridge_routes.list_omlx_models", return_value=[]) as listed:
            resp = client.get("/api/omlx/models")
        assert resp.status_code == 200
        assert listed.call_args.kwargs["api_key"] == _TEST_API_KEY

    def test_models_route_prefers_the_header_key(self, client):
        with patch("quodeq.api.llm_bridge_routes.get_api_key_secure", return_value=_TEST_API_KEY), \
             patch("quodeq.api.llm_bridge_routes.list_omlx_models", return_value=[]) as listed:
            client.get("/api/omlx/models", headers={"X-Api-Key": "sk-typed"})
        assert listed.call_args.kwargs["api_key"] == "sk-typed"

    def test_models_route_never_sends_the_stored_key_to_a_chosen_host(self, client):
        # GET skips the Origin check, so any page can pick base_url: the
        # keychain key only goes to the server the UI talks to by default.
        with patch("quodeq.api.llm_bridge_routes.get_api_key_secure", return_value=_TEST_API_KEY), \
             patch("quodeq.api.llm_bridge_routes.list_omlx_models", return_value=[]) as listed:
            client.get("/api/omlx/models?base_url=https://attacker.example")
        assert listed.call_args.kwargs["api_key"] is None

    def test_concurrency_route_never_sends_the_stored_key_to_a_chosen_host(self, client):
        with patch("quodeq.api.llm_bridge_routes.get_api_key_secure", return_value=_TEST_API_KEY), \
             patch("quodeq.api.llm_bridge_routes.run_omlx_concurrency_test", return_value={"ok": True}) as ran:
            client.post("/api/omlx/test-concurrency", json={"model": "m", "base_url": "https://attacker.example"},
                        headers={"Origin": "http://localhost"})
        assert ran.call_args.kwargs["api_key"] is None

    def test_concurrency_route_uses_stored_key_when_body_has_none(self, client):
        with patch("quodeq.api.llm_bridge_routes.get_api_key_secure", return_value=_TEST_API_KEY), \
             patch("quodeq.api.llm_bridge_routes.run_omlx_concurrency_test", return_value={"ok": True}) as ran:
            client.post("/api/omlx/test-concurrency", json={"model": "m"}, headers={"Origin": "http://localhost"})
        assert ran.call_args.kwargs["api_key"] == _TEST_API_KEY
