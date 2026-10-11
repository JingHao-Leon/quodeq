"""One run log request reads the project's score cache version once."""
from __future__ import annotations

import json
from pathlib import Path

import quodeq.services.run_log as run_log_module
from quodeq.services.run_log import RunChangeFiller, build_run_log, clear_partial_memo

PROJECT = "proj"
DIM = "maintainability"


class _NoSnapshots:
    def list_project_evaluations(self, project: str, reports_dir: str | None = None) -> list:
        return []


def _run(root: Path, run_id: str, state: str, started_at: str) -> None:
    run_dir = root / PROJECT / run_id
    (run_dir / "evaluation").mkdir(parents=True)
    (run_dir / "evaluation" / f"{DIM}.json").write_text(json.dumps({
        "dimension": DIM, "principles": [], "violations": [], "compliance": []}), encoding="utf-8")
    (run_dir / "status.json").write_text(json.dumps({"state": state, "started_at": started_at}), encoding="utf-8")


def test_the_score_cache_version_is_computed_once_per_request(tmp_path, monkeypatch) -> None:
    root = tmp_path / "evaluations"
    _run(root, "r-done", "done", "2026-09-26T00:00:00Z")
    _run(root, "r-cancelled", "cancelled", "2026-09-25T00:00:00Z")
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(root))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    real = run_log_module.score_cache_version
    calls: list[Path] = []

    def counting(project_dir: Path, params) -> str:
        calls.append(project_dir)
        return real(project_dir, params)

    monkeypatch.setattr(run_log_module, "score_cache_version", counting)
    monkeypatch.setattr("quodeq.services._run_log_partials.score_cache_version", counting, raising=False)
    clear_partial_memo()
    try:
        out = build_run_log(root, PROJECT, provider=_NoSnapshots(), filler=RunChangeFiller(budget_s=60.0))
    finally:
        clear_partial_memo()

    assert {r["runId"] for r in out["runs"]} == {"r-done", "r-cancelled"}
    assert len(calls) == 1
