"""get_dismissed: the listing joined with the dismissal's own metadata."""
from datetime import UTC, datetime

import pytest

from quodeq.assistant.tools import ToolContext, build_registry
from quodeq.core.dismissals import DismissedEntry, DismissedKeys
from quodeq.data.sqlite.assistant_repository import AssistantRepository


def _ctx(tmp_path, visible_standard_ids=None, make_dir=True):
    if make_dir:
        (tmp_path / "reports" / "p").mkdir(parents=True)
    repo = AssistantRepository(tmp_path / "assistant.db")
    repo.create_session(session_id="s1", provider="ollama")
    return ToolContext(
        repository=repo, session_id="s1", run_dir=None, repo_root=None,
        evaluators_dir=tmp_path / "e", compiled_dir=tmp_path / "c", dimensions_file=tmp_path / "d.json",
        project_id="p", reports_dir=tmp_path / "reports", visible_standard_ids=visible_standard_ids)


_WHEN = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
_ENTRIES = (
    DismissedEntry(req="R-1", file="a.py", line=3, reason="test fixture", dismissed_at=_WHEN, run_id="run1"),
    DismissedEntry(req="R-2", file="b.py", line=7),
    DismissedEntry(req="R-3", file="c.py", line=9),
)


def _item(req, file, line, dimension):
    return {"req": req, "file": file, "line": line, "dimension": dimension, "principle": "P",
            "severity": "major", "title": f"title {req}", "reason": "finding reason",
            "snippet": "big", "context": "big", "scope": "file", "endLine": line, "reqRefs": [],
            "fingerprint": "fp"}


@pytest.fixture()
def services(monkeypatch):
    calls = {}
    monkeypatch.setattr("quodeq.assistant.tools._read_tools_dismissed.dismissed_keys",
                        lambda project_dir: DismissedKeys(entries=_ENTRIES))

    def fake_load(project_dir, *, offset, limit):
        calls["page"] = (offset, limit)
        items = [_item("R-1", "a.py", 3, "security"), _item("R-2", "b.py", 7, "reliability"),
                 _item("R-3", "c.py", 9, "security")]
        return items[offset:offset + limit]

    monkeypatch.setattr("quodeq.assistant.tools._read_tools_dismissed.load_dismissed", fake_load)
    monkeypatch.setattr("quodeq.assistant.tools._read_tools_dismissed.verified_entries",
                        lambda project_dir, *, limit: [{"req": "R-9", "file": "z.py", "line": 1,
                                                        "note": "checked", "verifiedAt": "2026-10-02"}])
    return calls


def test_get_dismissed_joins_the_dismissal_metadata(tmp_path, services):
    res = build_registry(_ctx(tmp_path)).dispatch("get_dismissed", {})["result"]
    assert res["count"] == 3 and res["offset"] == 0 and res["project"] == "p"
    first, second = res["dismissed"][:2]
    assert first == {"file": "a.py", "line": 3, "dimension": "security", "principle": "P",
                     "severity": "major", "title": "title R-1", "reason": "finding reason",
                     "requirement": "R-1", "dismissReason": "test fixture",
                     "dismissedAt": "2026-10-01T12:00:00+00:00", "dismissedFromRun": "run1"}
    assert second["dismissReason"] is None and "snippet" not in second
    assert "verified" not in res


def test_get_dismissed_pages_and_keeps_the_total(tmp_path, services):
    res = build_registry(_ctx(tmp_path)).dispatch("get_dismissed", {"limit": 1, "offset": 2})["result"]
    assert services["page"] == (2, 1)
    assert res["count"] == 3 and [r["requirement"] for r in res["dismissed"]] == ["R-3"]


def test_get_dismissed_includes_verified_on_request(tmp_path, services):
    res = build_registry(_ctx(tmp_path)).dispatch("get_dismissed", {"include_verified": True})["result"]
    assert res["verified"][0]["note"] == "checked"


def test_get_dismissed_hides_hidden_standards(tmp_path, services):
    res = build_registry(_ctx(tmp_path, ("security",))).dispatch("get_dismissed", {})["result"]
    assert [r["requirement"] for r in res["dismissed"]] == ["R-1", "R-3"]
    assert res["hiddenStandardIds"] == ["reliability"]


def test_get_dismissed_for_a_missing_project_dir_is_a_tool_error(tmp_path, services):
    out = build_registry(_ctx(tmp_path, make_dir=False)).dispatch("get_dismissed", {})
    assert out["ok"] is False and "not found" in out["error"]
