"""The run log tells a cancelled run apart: what it planned and why it stopped."""
from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from quodeq.core.types.job import JobSnapshot
from quodeq.services.run_log import RunChangeFiller, build_run_log, clear_partial_memo

PROJECT = "proj"
DONE_RUN = "run-done"
CANCELLED_RUN = "run-cancelled"
DONE_DIM = "maintainability"
PLANNED = ["security", "maintainability", "reliability"]
SIGNAL_EXIT = "signal_SIGTERM"
STARTED = {DONE_RUN: "2026-10-14T02:00:00Z", CANCELLED_RUN: "2026-10-15T02:00:00Z"}
FINDING = {"req": "M-ANA-9", "file": "a.py", "line": 5, "snippet": "long", "severity": "minor"}


def _write_run(root: Path, run_id: str, state: str) -> None:
    run_dir = root / PROJECT / run_id
    (run_dir / "evaluation").mkdir(parents=True)
    (run_dir / "evaluation" / f"{DONE_DIM}.json").write_text(json.dumps({
        "dimension": DONE_DIM, "principles": [], "violations": [FINDING], "compliance": [],
    }), encoding="utf-8")
    (run_dir / "status.json").write_text(
        json.dumps({"state": state, "started_at": STARTED[run_id]}), encoding="utf-8")


def _snapshot(run_id: str, status: str) -> JobSnapshot:
    return JobSnapshot(job_id=f"ext-{run_id}", status=status, started_at=STARTED[run_id],
                       output_project=PROJECT, output_run_id=run_id)


class _Provider:
    def __init__(self, snapshots: list[JobSnapshot]) -> None:
        self.snapshots = snapshots

    def list_project_evaluations(self, project: str, reports_dir: str | None = None) -> list[JobSnapshot]:
        return [s for s in self.snapshots if s.output_project == project]


@pytest.fixture
def evals(tmp_path, monkeypatch) -> Path:
    root = tmp_path / "evaluations"
    _write_run(root, DONE_RUN, "done")
    _write_run(root, CANCELLED_RUN, "cancelled")
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(root))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    clear_partial_memo()
    yield root
    clear_partial_memo()


@pytest.fixture
def filler() -> RunChangeFiller:
    return RunChangeFiller(budget_s=60.0)


def _cancelled_snapshot() -> JobSnapshot:
    return replace(_snapshot(CANCELLED_RUN, "cancelled"), dimensions=PLANNED, exit_reason=SIGNAL_EXIT)


def _by_id(evals: Path, filler: RunChangeFiller, snapshots: list[JobSnapshot]) -> dict[str, dict]:
    runs = build_run_log(evals, PROJECT, provider=_Provider(snapshots), filler=filler)["runs"]
    return {r["runId"]: r for r in runs}


def test_a_cancelled_run_carries_its_plan_and_exit_reason(evals, filler) -> None:
    runs = _by_id(evals, filler, [_snapshot(DONE_RUN, "done"), _cancelled_snapshot()])
    cancelled = runs[CANCELLED_RUN]
    assert cancelled["partial"] is True and cancelled["dims"] == [DONE_DIM]
    assert (cancelled["plannedDims"], cancelled["exitReason"]) == (sorted(PLANNED), SIGNAL_EXIT)


def test_a_run_that_recorded_no_plan_or_reason_reads_null(evals, filler) -> None:
    runs = _by_id(evals, filler, [_snapshot(DONE_RUN, "done"), _snapshot(CANCELLED_RUN, "cancelled")])
    assert (runs[CANCELLED_RUN]["plannedDims"], runs[CANCELLED_RUN]["exitReason"]) == (None, None)
    assert runs[DONE_RUN]["plannedDims"] is None


def test_a_run_the_provider_does_not_know_reads_null(evals, filler) -> None:
    runs = _by_id(evals, filler, [])
    assert (runs[CANCELLED_RUN]["plannedDims"], runs[CANCELLED_RUN]["exitReason"]) == (None, None)


def test_change_data_cached_before_the_fields_existed_still_serves_them(evals, filler, monkeypatch) -> None:
    _by_id(evals, filler, [_snapshot(DONE_RUN, "done"), _snapshot(CANCELLED_RUN, "cancelled")])
    calls: list[tuple] = []
    monkeypatch.setattr("quodeq.services.run_log.diff_runs", lambda *a, **k: calls.append(a) or {})
    runs = _by_id(evals, filler, [_snapshot(DONE_RUN, "done"), _cancelled_snapshot()])
    assert calls == []
    assert runs[CANCELLED_RUN]["pending"] is False
    assert (runs[CANCELLED_RUN]["plannedDims"], runs[CANCELLED_RUN]["exitReason"]) == (sorted(PLANNED), SIGNAL_EXIT)
