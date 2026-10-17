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


# Long enough for a slow CI runner's worker thread; each check returns as soon as it holds.
_WAIT_SECONDS = 10.0
_RETRY_SECONDS = 0.05


def _post(client, sid, text):
    return client.post(f"/api/assistant/sessions/{sid}/messages", json={"text": text})


def _wait_until(check):
    """Retry *check* until it returns a truthy value or the deadline passes; return its last value.

    The worker thread fails at its own pace, so a fixed sleep raced it on slow runners.
    """
    deadline = time.monotonic() + _WAIT_SECONDS
    while True:
        value = check()
        if value or time.monotonic() >= deadline:
            return value
        time.sleep(_RETRY_SECONDS)


def _events_with_error(client, sid):
    body = client.get(f"/api/assistant/sessions/{sid}/events?after=0").get_data(as_text=True)
    return body if '"type": "error"' in body else None


def _second_turn_accepted(client, sid):
    return _post(client, sid, "second").status_code == 202


def test_worker_turns_an_escaped_exception_into_an_error_frame(client, app, monkeypatch):
    monkeypatch.setattr("quodeq.api._assistant_events.POLL_SECONDS", 0.001)
    monkeypatch.setattr("quodeq.api._assistant_events.IDLE_LIMIT", 30)

    def exploding_run_turn(request, *, repository, tool_ctx, **kw):
        raise RuntimeError("turn exploded past run_turn's own boundary")

    monkeypatch.setattr("quodeq.api.assistant_routes.run_turn", exploding_run_turn)
    sid = client.post("/api/assistant/sessions",
                      json={"provider": "ollama", "model": "m"}).get_json()["sessionId"]
    assert _post(client, sid, "hello").status_code == 202

    body = _wait_until(lambda: _events_with_error(client, sid))
    assert body is not None
    assert "unexpected error" in body
    assert "turn exploded" not in body  # the traceback goes to the log, not the browser


def test_worker_frees_the_turn_slot_after_an_escaped_exception(client, app, monkeypatch):
    def exploding_run_turn(request, *, repository, tool_ctx, **kw):
        raise RuntimeError("boom")

    monkeypatch.setattr("quodeq.api.assistant_routes.run_turn", exploding_run_turn)
    sid = client.post("/api/assistant/sessions",
                      json={"provider": "ollama", "model": "m"}).get_json()["sessionId"]
    assert _post(client, sid, "first").status_code == 202
    assert _wait_until(lambda: _second_turn_accepted(client, sid))


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
        assert _wait_until(lambda: _second_turn_accepted(client, sid))
    assert any("assistant turn worker" in r.message for r in caplog.records)
    assert any("error frame" in r.message for r in caplog.records)
