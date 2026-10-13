"""Each action's apply step drives its injected ports, so a fake stands in for every service."""
from __future__ import annotations

import pytest

from quodeq.assistant.tools.actions import ACTIONS, ActionConflict, ActionContext

_FINDING = {"project": "proj", "req": "R-1", "file": "a.py", "line": 7}
_KEY = {"req": "R-1", "file": "a.py", "line": 7}


def _recording_context(calls: list, *, import_result=None, scores=None, delta=None) -> ActionContext:
    """Ports that log ``(name, *args)`` and answer with the given values."""
    answers = {"import_standard": import_result, "rescore": scores, "dismiss_delta": delta}

    def port(name):
        def call(*args):
            calls.append((name, *args))
            return answers.get(name)
        return call

    return ActionContext(
        import_standard=port("import_standard"), dismiss_finding=port("dismiss_finding"),
        rescore=port("rescore"), dismiss_delta=port("dismiss_delta"), verify_finding=port("verify_finding"),
    )


def test_create_standard_returns_what_the_import_port_answers():
    calls: list = []
    ctx = _recording_context(calls, import_result={"status": "imported", "id": "s1"})

    result = ACTIONS["create_standard"].apply({"id": "s1"}, ctx)

    assert result == {"status": "imported", "id": "s1"}
    assert calls == [("import_standard", {"id": "s1"})]


def test_create_standard_conflicts_when_the_import_port_answers_none():
    ctx = _recording_context([], import_result=None)

    with pytest.raises(ActionConflict):
        ACTIONS["create_standard"].apply({"id": "s1"}, ctx)


def test_dismiss_records_rescoring_and_describes_the_delta_in_order():
    calls: list = []
    ctx = _recording_context(calls, scores={"overall": 9.1}, delta={"isLatest": True})
    payload = {**_FINDING, "reason": "guarded upstream", "runId": "run-1"}

    result = ACTIONS["dismiss_finding"].apply(payload, ctx)

    assert calls == [
        ("dismiss_finding", "proj", {**_KEY, "dismissReason": "guarded upstream"}, "run-1"),
        ("rescore", "proj", "run-1"),
        ("dismiss_delta", "proj", "run-1", _KEY),
    ]
    assert result == {"dismissed": True, "scores": {"overall": 9.1}, "delta": {"isLatest": True}}


def test_dismiss_in_overview_scope_passes_no_run_id():
    calls: list = []
    ctx = _recording_context(calls)

    ACTIONS["dismiss_finding"].apply({**_FINDING, "reason": "noise"}, ctx)

    assert [c[-1] if c[0] != "dismiss_delta" else c[2] for c in calls] == [None, None, None]


def test_verify_hands_the_payload_to_its_port():
    calls: list = []
    ctx = _recording_context(calls)
    payload = {**_FINDING, "note": "confirmed by hand"}

    result = ACTIONS["verify_finding"].apply(payload, ctx)

    assert result == {"verified": True}
    assert calls == [("verify_finding", "proj", payload)]


@pytest.mark.parametrize("action_type, extra", [
    ("dismiss_finding", {"reason": "r"}),
    ("verify_finding", {"note": "n"}),
])
def test_a_traversal_project_id_is_rejected_before_any_port_runs(action_type, extra):
    calls: list = []
    ctx = _recording_context(calls)

    with pytest.raises(ValueError):
        ACTIONS[action_type].apply({**_FINDING, "project": "../other", **extra}, ctx)

    assert calls == []
