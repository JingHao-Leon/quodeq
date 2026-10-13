"""Shared run builders and fixtures for tests/services/test_map_history*.py."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from quodeq.services import map_history

DIMS = ("security", "maintainability")


def write_run(project_dir: Path, run_id: str, day: str, violations: dict[str, list[dict]], dims=DIMS, state="done",
         at: str = "10:00:00") -> None:
    run = project_dir / run_id
    (run / "evaluation").mkdir(parents=True, exist_ok=True)
    for dim in dims:
        (run / "evaluation" / f"{dim}.json").write_text(json.dumps({
            "dimension": dim, "date": f"{day}T{at}+00:00", "principles": [],
            "violations": violations.get(dim, []), "compliance": []}))
    (run / "status.json").write_text(json.dumps({"state": state, "started_at": f"{day}T{at}Z"}))


@pytest.fixture
def env(tmp_path, monkeypatch):
    evals = tmp_path / "evaluations"
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    return evals


def violation(file: str, sev: str = "major", req: str = "R1", snip: str = "x()") -> dict:
    return {"req": req, "file": file, "line": 1, "snippet": snip, "severity": sev}


def write_two_runs(env) -> None:
    p = env / "proj"
    write_run(p, "r1", "2026-09-01", {"security": [violation("x/a.py")]})
    write_run(p, "r2", "2026-09-08", {"security": [violation("x/a.py")]})


@pytest.fixture
def cached_runs(monkeypatch):
    """The run ids the map snapshot store holds, tracked through its save function (prune, then store)."""
    held: set[str] = set()
    real = map_history.save_map_snapshots

    def spy(project, write):
        held.intersection_update(write.keep_runs)
        held.update(write.runs)
        real(project, write)
    monkeypatch.setattr(map_history, "save_map_snapshots", spy)
    return held
