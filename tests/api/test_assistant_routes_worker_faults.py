"""The turn worker thread is the last fault boundary: a ``run_turn`` that
raises must not kill the daemon thread silently. The stream gets a terminal
``error`` frame and the session's turn slot is freed, so the next message
is accepted rather than 409ing forever."""
import time

from tests.api._assistant_routes_fixtures import (  # noqa: F401 -- app/client are pytest fixtures
    _repo,
    app,
    client,
)


def _post(client, sid, text):
    return client.post(f"/api/assistant/sessions/{sid}/messages", json={"text": text})


def test_worker_turns_an_escaped_exception_into_an_error_frame(client, app, monkeypatch):
    monkeypatch.setattr("quodeq.api._assistant_events.POLL_SECONDS", 0.001)
    monkeypatch.setattr("quodeq.api._assistant_events.IDLE_LIMIT", 30)

    def exploding_run_turn(request, *, repository, tool_ctx, **kw):
        raise RuntimeError("turn exploded past run_turn's own boundary")

    monkeypatch.setattr("quodeq.api.assistant_routes.run_turn", exploding_run_turn)
    sid = client.post("/api/assistant/sessions",
                      json={"provider": "ollama", "model": "m"}).get_json()["sessionId"]
    assert _post(client, sid, "hello").status_code == 202
    time.sleep(0.3)  # let the daemon thread die

    body = client.get(f"/api/assistant/sessions/{sid}/events?after=0").get_data(as_text=True)
    assert '"type": "error"' in body
    assert "unexpected error" in body
    assert "turn exploded" not in body  # the traceback goes to the log, not the browser


def test_worker_frees_the_turn_slot_after_an_escaped_exception(client, app, monkeypatch):
    def exploding_run_turn(request, *, repository, tool_ctx, **kw):
        raise RuntimeError("boom")

    monkeypatch.setattr("quodeq.api.assistant_routes.run_turn", exploding_run_turn)
    sid = client.post("/api/assistant/sessions",
                      json={"provider": "ollama", "model": "m"}).get_json()["sessionId"]
    assert _post(client, sid, "first").status_code == 202
    time.sleep(0.3)
    assert _post(client, sid, "second").status_code == 202


def test_worker_survives_a_store_that_cannot_take_the_error_frame(client, app, monkeypatch, caplog):
    """When appending the error frame fails too, the failure is logged and
    the slot is still released; nothing propagates out of the thread."""
    def exploding_run_turn(request, *, repository, tool_ctx, **kw):
        raise RuntimeError("boom")

    monkeypatch.setattr("quodeq.api.assistant_routes.run_turn", exploding_run_turn)
    from quodeq.data.sqlite.assistant_repository import AssistantRepository

    def refuse(self, session_id, frame):
        raise OSError("store is read-only")

    monkeypatch.setattr(AssistantRepository, "append_event", refuse)
    sid = client.post("/api/assistant/sessions",
                      json={"provider": "ollama", "model": "m"}).get_json()["sessionId"]
    with caplog.at_level("WARNING", logger="quodeq.api.assistant_turn_routes"):
        assert _post(client, sid, "first").status_code == 202
        time.sleep(0.3)
    assert any("assistant turn worker" in r.message for r in caplog.records)
    assert any("error frame" in r.message for r in caplog.records)
    assert _post(client, sid, "second").status_code == 202
