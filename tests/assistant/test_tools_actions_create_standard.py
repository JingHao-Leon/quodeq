"""draft_action for create_standard: the reviewable-content gate and the
outline the preview card renders."""
import pytest

from quodeq.assistant.tools import ToolContext, build_registry
from quodeq.data.sqlite.assistant_repository import AssistantRepository
from tests.assistant.test_tools_actions import _VALID_STANDARD


@pytest.fixture()
def ctx(tmp_path):
    store = AssistantRepository(tmp_path / "assistant.db")
    store.create_session(session_id="s1", provider="ollama")
    return ToolContext(
        repository=store, session_id="s1", run_dir=None, repo_root=None,
        evaluators_dir=tmp_path / "e", compiled_dir=tmp_path / "c",
        dimensions_file=tmp_path / "d.json",
    )


# The two requirements after the first in _VALID_STANDARD, to pad a case
# that varies one requirement up to the per-principle floor.
_FILLER = _VALID_STANDARD["principles"][0]["requirements"][1:]


def _standard_with(requirements):
    return {**_VALID_STANDARD,
            "principles": [{"name": "P1", "description": "", "requirements": requirements}]}


@pytest.mark.parametrize("requirements, complaint", [
    ([], "no requirements"),
    ([{"id": "", "text": "Endpoints return RFC7807"}], "missing an id"),
    ([{"id": "r1", "text": "   "}], "missing its text"),
    ([{"id": "r1", "description": "only a blurb"}], "missing its text"),
    (_VALID_STANDARD["principles"][0]["requirements"][:2], "has 2 requirements, needs at least 3"),
])
def test_draft_create_standard_rejects_hollow_content(ctx, requirements, complaint):
    """A drafted standard must be reviewable: every principle carries at least
    three requirements and every requirement has an id and a checkable text.
    The model gets the complaint back in-loop instead of the user seeing an
    empty card."""
    out = build_registry(ctx).dispatch("draft_action", {
        "action_type": "create_standard", "payload": _standard_with(requirements),
    })
    assert out["ok"] is False
    assert complaint in out["error"]
    assert "P1" in out["error"]


def test_draft_create_standard_summary_carries_outline(ctx):
    """The preview card renders the server-canonical outline, so the summary
    must carry each principle with its requirement ids and texts."""
    assert build_registry(ctx).dispatch("draft_action", {
        "action_type": "create_standard", "payload": _VALID_STANDARD,
    })["ok"] is True
    frames = [f for _, f in ctx.repository.events_after("s1", 0)]
    draft = next(f for f in frames if f["type"] == "action_draft")
    assert draft["summary"]["principleCount"] == 1
    outline = draft["summary"]["principles"]
    assert [p["name"] for p in outline] == ["P1"]
    assert outline[0]["requirements"][0] == {"id": "r1", "text": "Endpoints return RFC7807", "refs": []}
    assert [r["id"] for r in outline[0]["requirements"]] == ["r1", "r2", "r3"]


def test_draft_create_standard_summary_carries_http_refs_only(ctx):
    """Requirement refs reach the card as links, so only http(s) urls pass;
    a javascript: url is dropped while its name survives."""
    payload = _standard_with([{
        "id": "r1", "text": "Activities release listeners in onPause", "refs": [
            {"source": "url", "name": "Android lifecycle guide",
             "url": "https://developer.android.com/guide/components/activities/activity-lifecycle"},
            {"source": "url", "name": "evil", "url": "javascript:alert(1)"},
            {"source": "cwe", "id": "79"},
        ]}, *_FILLER])
    assert build_registry(ctx).dispatch("draft_action", {
        "action_type": "create_standard", "payload": payload})["ok"] is True
    draft = next(f for _, f in ctx.repository.events_after("s1", 0) if f["type"] == "action_draft")
    assert draft["summary"]["principles"][0]["requirements"][0]["refs"] == [
        {"name": "Android lifecycle guide",
         "url": "https://developer.android.com/guide/components/activities/activity-lifecycle"},
        {"name": "evil", "url": None},
        {"name": "cwe 79", "url": None},
    ]
