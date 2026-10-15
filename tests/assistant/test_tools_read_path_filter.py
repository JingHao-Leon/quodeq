"""get_violations narrowed to a folder or file via `path`, in both scopes."""
import json

import pytest

from quodeq.assistant.tools import ToolContext, build_registry
from quodeq.data.sqlite.assistant_repository import AssistantRepository

from ._tools_read_helpers import _acc_ctx, _run_ctx


@pytest.fixture()
def ctx(tmp_path):
    return _run_ctx(tmp_path)


def _ctx_with_files(tmp_path, *files):
    """A run whose one dimension holds one violation per file in *files*."""
    run_dir = tmp_path / "run"
    eval_dir = run_dir / "evaluation"
    eval_dir.mkdir(parents=True)
    (eval_dir / "security.json").write_text(json.dumps({
        "dimension": "security", "overallScore": 50, "overallGrade": "C",
        "principles": [{"name": "P1", "grade": "C"}],
        "violations": [{"principle": "P1", "file": f, "line": 1, "severity": "minor",
                        "title": "t", "reason": "r"} for f in files],
        "totals": {"violations": len(files)},
    }))
    repo = AssistantRepository(tmp_path / "assistant.db")
    repo.create_session(session_id="s1", provider="ollama")
    return ToolContext(
        repository=repo, session_id="s1", run_dir=run_dir, repo_root=None,
        evaluators_dir=tmp_path / "e", compiled_dir=tmp_path / "c",
        dimensions_file=tmp_path / "d.json")


@pytest.mark.parametrize("path,expected", [
    ("feature-component-tracking", 1),
    ("feature-component-tracking/src", 1),
    ("src/main", 1),
    ("A.kt", 1),
    ("tracking", 0),
    ("main/A", 0),
    (".hidden", 1),
    ("app/", 1),
])
def test_path_matches_on_whole_segments(tmp_path, path, expected):
    ctx = _ctx_with_files(tmp_path, "feature-component-tracking/src/main/A.kt", "app/.hidden/x.py")
    res = build_registry(ctx).dispatch("get_violations", {"path": path})["result"]
    assert res["count"] == expected


def test_path_filter_counts_only_the_folder(ctx):
    out = build_registry(ctx).dispatch("get_violations", {"path": "src/"})
    res = out["result"]
    # All four seeded violations live under src/; one is in another dimension.
    assert res["count"] == 4
    assert res["total_in_scope"] == 4
    assert res["path"] == "src"
    assert res["by_requirement"] == {"(unknown)": 4}
    assert res["by_file"] == {"src/a.py": 1, "src/b.py": 1, "src/c.py": 1, "src/r.py": 1}


def test_path_filter_to_one_file(ctx):
    out = build_registry(ctx).dispatch(
        "get_violations", {"dimension": "security", "path": "./src/b.py"})
    res = out["result"]
    assert res["count"] == 1
    assert res["total_in_scope"] == 3
    assert [v["file"] for v in res["violations"]] == ["src/b.py"]
    assert res["by_principle"] == {"P2": 1}


def test_path_filter_with_no_match_is_empty_not_an_error(ctx):
    out = build_registry(ctx).dispatch("get_violations", {"path": "nope"})
    assert out["ok"] is True
    assert out["result"]["count"] == 0
    assert out["result"]["violations"] == []
    assert out["result"]["total_in_scope"] == 4


def test_no_path_omits_the_path_keys_but_keeps_the_new_counts(ctx):
    res = build_registry(ctx).dispatch("get_violations", {"dimension": "security"})["result"]
    assert "path" not in res and "total_in_scope" not in res
    assert res["by_file"] == {"src/a.py": 1, "src/b.py": 1, "src/c.py": 1}
    assert res["by_requirement"] == {"(unknown)": 3}


def test_path_filter_in_accumulated_scope(tmp_path, monkeypatch):
    ctx = _acc_ctx(tmp_path, monkeypatch)
    res = build_registry(ctx).dispatch("get_violations", {"path": "b.kt"})["result"]
    assert res["count"] == 1
    assert res["total_in_scope"] == 3
    assert res["violations"][0]["principle"] == "S2"
