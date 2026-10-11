"""The project row fetcher persists done runs only; cancelled and running runs are read fresh."""
from __future__ import annotations

import json
from pathlib import Path

from quodeq.services.scoring import ProjectRows

_FETCHER = "quodeq.services.scoring._fetchers.make_scoring_trend_fetcher"


def _run(root: Path, run_id: str, state: str) -> None:
    run_dir = root / "p" / run_id
    (run_dir / "evaluation").mkdir(parents=True)
    (run_dir / "evaluation" / "maintainability.json").write_text(json.dumps({
        "dimension": "maintainability", "principles": [], "violations": [], "compliance": [],
    }), encoding="utf-8")
    (run_dir / "status.json").write_text(
        json.dumps({"state": state, "started_at": "2026-09-20T00:00:00Z"}), encoding="utf-8")


def test_only_done_runs_are_cacheable(tmp_path, monkeypatch) -> None:
    seen: dict = {}
    monkeypatch.setattr(_FETCHER, lambda *a, **k: seen.update(k))
    for run_id, state in (("done-run", "done"), ("cancelled-run", "cancelled"), ("running-run", "running")):
        _run(tmp_path, run_id, state)
    ProjectRows.load(tmp_path, "p")
    assert seen["cacheable_run_ids"] == {"done-run"}
