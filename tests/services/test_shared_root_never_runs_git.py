"""A shared clone's run files and recorded repo path were written by someone
else: reading its dashboard never runs git, whatever its status.json says."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

import quodeq.services.run_changes as run_changes
from quodeq.services.dashboard_since_baseline import since_baseline_summary

_PROJECT = "p"
_PREV, _CURR = "r-prev", "r-curr"
_DIM = "security"


def _run(eval_root: Path, run_id: str, started_at: str, sha: str) -> None:
    run_dir = eval_root / _PROJECT / run_id
    (run_dir / "evaluation").mkdir(parents=True)
    (run_dir / "evaluation" / f"{_DIM}.json").write_text(json.dumps({
        "dimension": _DIM, "principles": [], "compliance": [],
        "violations": [{"req": "S-1", "file": "a.py", "line": 1, "snippet": "x", "severity": "minor"}]}),
        encoding="utf-8")
    (run_dir / "status.json").write_text(json.dumps(
        {"state": "done", "started_at": started_at, "commit_sha": sha, "commit_dirty": False}), encoding="utf-8")


def _shared_clone(tmp_path: Path, base_sha: str, head_sha: str) -> Path:
    """``<clone>/evaluations`` laid out like a shared clone, its repo path naming *tmp_path*/work."""
    clone = tmp_path / "clone"
    (clone / ".git").mkdir(parents=True)
    (clone / "quodeq.json").write_text("{}", encoding="utf-8")
    eval_root = clone / "evaluations"
    _run(eval_root, _PREV, "2026-09-20T00:00:00Z", base_sha)
    _run(eval_root, _CURR, "2026-09-26T00:00:00Z", head_sha)
    work = tmp_path / "work"
    work.mkdir()
    (eval_root / _PROJECT / "repository_info.json").write_text(
        json.dumps({"name": _PROJECT, "path": str(work), "location": "local"}), encoding="utf-8")
    return eval_root


@pytest.fixture(autouse=True)
def _fresh_memos():
    since_baseline_summary.cache_clear()
    run_changes.changed_files.cache_clear()
    yield
    since_baseline_summary.cache_clear()
    run_changes.changed_files.cache_clear()


def test_an_output_option_sha_under_a_shared_root_creates_no_file(tmp_path: Path) -> None:
    target = tmp_path / "pwned"
    eval_root = _shared_clone(tmp_path, f"--output={target}", "HEAD")

    summary = since_baseline_summary(eval_root, _PROJECT, _CURR)

    assert not target.exists()
    assert summary[_DIM]["sinceBaseline"]["scope"] == "all"


def test_a_shared_root_runs_no_git_even_for_well_formed_shas(tmp_path: Path, monkeypatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(run_changes, "git_stdout", lambda argv, **_: calls.append(argv) or "")
    eval_root = _shared_clone(tmp_path, "a" * 40, "b" * 40)

    since_baseline_summary(eval_root, _PROJECT, _CURR)

    assert calls == []


def test_the_same_layout_outside_a_clone_still_diffs_the_commits(tmp_path: Path, monkeypatch) -> None:
    """Control: without the clone markers the recorded working copy is trusted."""
    calls: list[list[str]] = []
    monkeypatch.setattr(run_changes, "git_stdout", lambda argv, **_: calls.append(argv) or "a.py\n")
    eval_root = _shared_clone(tmp_path, "a" * 40, "b" * 40)
    (eval_root.parent / "quodeq.json").unlink()

    summary = since_baseline_summary(eval_root, _PROJECT, _CURR)

    assert len(calls) == 1 and summary[_DIM]["sinceBaseline"]["scope"] == "changed-files"
