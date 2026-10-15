"""A shared scoped child resolves to ONE settings file everywhere.

A shared clone's ``repository_info.json`` may name a ``parent``; owners are
read only from the LOCAL evaluations root, so the API route, the assistant
(MCP here; in-process in tests/assistant/test_tool_context_visibility.py)
and the dashboard summary all land on the same file.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from quodeq.api.app import create_app
from quodeq.assistant.mcp import server as mcp_server
from quodeq.services.fs_project_helpers import read_accumulated_summary

from tests.services.conftest import stub_row_fetcher

_LOCALHOST = {"Origin": "http://localhost"}


@pytest.fixture()
def shared_root(tmp_path: Path) -> Path:
    """A shared clone where 'child' is a scoped sub-project of 'parent'."""
    root = tmp_path / "shared"
    for pid, info in (("parent", {"name": "parent"}), ("child", {"name": "child", "parent": "parent"})):
        (root / pid / "run-new").mkdir(parents=True)
        (root / pid / "repository_info.json").write_text(json.dumps(info), encoding="utf-8")
    return root


@pytest.fixture()
def saved_via_api() -> None:
    """The child's selection saved through the real PUT route."""
    app = create_app(test_config={"TESTING": True})
    with app.test_client() as c:
        resp = c.put("/api/projects/child/standards-visibility",
                     json={"visibleStandardIds": ["security"]}, headers=_LOCALHOST)
    assert resp.status_code == 200


def test_mcp_assistant_with_a_shared_reports_dir_sees_the_api_selection(tmp_path, monkeypatch, shared_root, saved_via_api):
    captured = {}
    real = mcp_server.ToolContext
    monkeypatch.setattr(mcp_server, "ToolContext", lambda **kw: captured.setdefault("ctx", real(**kw)))
    ns = argparse.Namespace(
        db_path=str(tmp_path / "a.db"), session_id="m", run_dir=None, repo_root=None,
        evaluators_dir=str(tmp_path / "e"), compiled_dir=str(tmp_path / "c"),
        dimensions_file=str(tmp_path / "d.json"), project_id="child",
        reports_dir=str(shared_root), enable_write=False, worktree_dir=None, read_only=True)
    mcp_server._build_registry_from_args(ns)
    assert captured["ctx"].visible_standard_ids == ("security",)


@patch("quodeq.services._fs_metadata.summarize_dimensions")
def test_summary_over_the_shared_root_uses_the_api_selection(mock_summarize, monkeypatch, shared_root, saved_via_api):
    from quodeq.core.types import DimensionResult
    from quodeq.data.fs.report_parser.runs import RunInfo

    stub_row_fetcher(monkeypatch, lambda root, proj, rid: [
        DimensionResult(dimension="security", overall_score="8.0"),
        DimensionResult(dimension="usability", overall_score="7.0"),
    ])
    mock_summarize.return_value = type("S", (), {"overall_grade": "A", "numeric_average": 8.0})()
    runs = [RunInfo(run_id="run-new", date_iso="2026-01-02", date_label="Jan 02")]
    read_accumulated_summary(shared_root, "child", runs, cache_enabled=False)
    assert {d.dimension for d in mock_summarize.call_args[0][0]} == {"security"}
