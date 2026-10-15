"""The run log: every scored run with its comparison run, counts and throughput."""
from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from quodeq.core.run.origin import RunOrigin
from quodeq.core.types.job import JobSnapshot
from quodeq.services.dismissed import dismiss_finding
from quodeq.services.run_log import RunChangeFiller, build_run_log, clear_partial_memo

PROJECT = "proj"
PREV = "run-prev"
CURR = "run-curr"
DIM = "maintainability"
MODEL = "qwen"
COMMIT = "6d62f65aa11"
NEW_FINDING = {"req": "M-ANA-9", "file": "a.py", "line": 5, "snippet": "long", "severity": "minor"}
GONE_FINDING = {"req": "M-REU-1", "file": "b.py", "line": 2, "snippet": "dup()", "severity": "minor"}
STARTED = {PREV: "2026-09-20T00:00:00Z", CURR: "2026-09-26T00:00:00.5+00:00"}
WAIT_S = 10


def _report(run_dir: Path, violations: list[dict], compliance: list[dict], started_at: str) -> None:
    (run_dir / "evaluation").mkdir(parents=True, exist_ok=True)
    (run_dir / "evaluation" / f"{DIM}.json").write_text(json.dumps({
        "dimension": DIM, "principles": [], "violations": violations, "compliance": compliance,
    }), encoding="utf-8")
    (run_dir / "status.json").write_text(json.dumps({
        "state": "done", "started_at": started_at, "ai_model": MODEL}), encoding="utf-8")


def _snapshot(run_id: str, status: str = "done") -> JobSnapshot:
    return JobSnapshot(
        job_id=f"ext-{run_id}", status=status, started_at=STARTED[run_id], ended_at="2026-09-27T00:00:00Z",
        output_project=PROJECT, output_run_id=run_id, ai_model=MODEL, ai_provider="ollama",
        commit_sha=COMMIT, origin=RunOrigin(kind="ci", workflow="Quodeq Nightly"), current_dimension=DIM,
    )


class _Provider:
    def __init__(self, snapshots: list[JobSnapshot]) -> None:
        self.snapshots = snapshots

    def list_project_evaluations(self, project: str, reports_dir: str | None = None) -> list[JobSnapshot]:
        return [s for s in self.snapshots if s.output_project == project]


PROVIDER = _Provider([_snapshot(CURR), _snapshot(PREV)])


@pytest.fixture
def evals(tmp_path, monkeypatch) -> Path:
    root = tmp_path / "evaluations"
    _report(root / PROJECT / PREV, [GONE_FINDING], [], STARTED[PREV])
    _report(root / PROJECT / CURR, [NEW_FINDING],
            [{"req": "M-REU-1", "file": "b.py", "line": 2, "snippet": "ok"}], STARTED[CURR])
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(root))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    return root


@pytest.fixture(autouse=True)
def _fresh_partial_memo():
    clear_partial_memo()
    yield
    clear_partial_memo()


@pytest.fixture
def filler_sync() -> RunChangeFiller:
    return RunChangeFiller(budget_s=60.0)


def dismiss_one(project_dir: Path, finding: dict) -> None:
    dismiss_finding(project_dir, finding)


def _raise_value_error(*_a, **_k):
    raise ValueError("malformed report")


def test_runs_carry_meta_scores_and_their_comparison(evals, filler_sync) -> None:
    payload = build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler_sync)
    newest, older = payload["runs"]
    assert (newest["runId"], newest["baselineRunId"], newest["baselineKind"]) == (CURR, PREV, "same-model")
    assert newest["counts"] == {"new": 1, "resolved": 1, "notReevaluated": 0}
    assert older["baselineRunId"] is None and older["counts"] is None
    assert newest["model"] == "qwen" and newest["pending"] is False
    assert newest["dimensionDetails"][0]["dimension"] == DIM


def test_an_entry_has_exactly_the_contract_keys(evals, filler_sync) -> None:
    payload = build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler_sync)
    newest = payload["runs"][0]
    assert set(newest) == {
        "runId", "jobId", "startedAt", "endedAt", "status", "model", "provider", "commit", "origin",
        "dims", "partial", "score", "grade", "open", "critical", "majors", "dimensionDetails",
        "filesAnalysed", "activeSeconds", "baselineRunId", "baselineKind", "counts", "newSev",
        "resolvedSev", "pending", "plannedDims", "exitReason",
    }
    assert (newest["jobId"], newest["commit"], newest["dims"]) == (f"ext-{CURR}", COMMIT[:7], [DIM])
    assert newest["origin"] == {"kind": "ci", "workflow": "Quodeq Nightly"}
    assert set(newest["dimensionDetails"][0]) == {"dimension", "score", "grade", "majors", "critical"}
    assert newest["newSev"] == {"minor": 1} and newest["partial"] is False
    assert payload["running"] is None


def test_the_running_job_is_reported_apart(evals, filler_sync) -> None:
    provider = _Provider([_snapshot(CURR, status="running"), _snapshot(PREV)])
    running = build_run_log(evals, PROJECT, provider=provider, filler=filler_sync)["running"]
    assert running == {"jobId": f"ext-{CURR}", "startedAt": STARTED[CURR], "model": MODEL,
                       "origin": {"kind": "ci", "workflow": "Quodeq Nightly"}, "currentDimension": DIM}


def test_a_run_the_provider_does_not_know_still_lists_without_meta(evals, filler_sync) -> None:
    payload = build_run_log(evals, PROJECT, provider=_Provider([]), filler=filler_sync)
    by_id = {r["runId"]: r for r in payload["runs"]}
    assert set(by_id) == {CURR, PREV}
    run = by_id[CURR]
    assert (run["model"], run["commit"], run["origin"], run["jobId"]) == (None, None, None, None)


def test_runs_are_ordered_by_real_time_across_stamp_formats(evals, filler_sync) -> None:
    curr = replace(_snapshot(CURR), started_at="2026-09-26T02:00:00+02:00")  # 00:00 UTC
    prev = replace(_snapshot(PREV), started_at="2026-09-26T01:00:00Z")
    payload = build_run_log(evals, PROJECT, provider=_Provider([curr, prev]), filler=filler_sync)
    assert [r["runId"] for r in payload["runs"]] == [PREV, CURR]
    assert payload["runs"][0]["baselineRunId"] == CURR


def test_an_unknown_project_is_an_empty_log(evals, filler_sync) -> None:
    assert build_run_log(evals, "nope", provider=PROVIDER, filler=filler_sync) == {"runs": [], "running": None}


def test_counts_are_cached_by_version_and_baseline(evals, filler_sync, monkeypatch) -> None:
    build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler_sync)
    calls = []
    monkeypatch.setattr("quodeq.services.run_log.diff_runs", lambda *a, **k: calls.append(a) or {})
    build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler_sync)
    assert calls == []


def test_a_dismissal_invalidates_cached_counts(evals, filler_sync) -> None:
    build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler_sync)
    dismiss_one(evals / PROJECT, NEW_FINDING)
    payload = build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler_sync)
    assert payload["runs"][0]["counts"]["new"] == 0


def test_over_budget_runs_are_pending_and_filled_in_the_background(evals) -> None:
    filler = RunChangeFiller(budget_s=0.0)
    first = build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler)
    assert first["runs"][0]["pending"] is True
    assert filler.wait_idle(timeout=WAIT_S)
    second = build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler)
    assert second["runs"][0]["pending"] is False and second["runs"][0]["counts"] is not None


def test_a_run_whose_diff_fails_is_not_pending_forever(evals, filler_sync, monkeypatch) -> None:
    monkeypatch.setattr("quodeq.services.run_log.diff_runs", _raise_value_error)
    run = build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler_sync)["runs"][0]
    assert run["pending"] is False and run["counts"] is None


def test_a_deleted_run_leaves_no_cached_change_behind(evals, filler_sync) -> None:
    import shutil  # noqa: PLC0415

    from quodeq.services.wiring import open_score_cache  # noqa: PLC0415

    build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler_sync)
    shutil.rmtree(evals / PROJECT / PREV)
    build_run_log(evals, PROJECT, provider=_Provider([_snapshot(CURR)]), filler=filler_sync)
    with open_score_cache() as conn:
        rows = conn.execute("SELECT run_id FROM run_change WHERE project=?", (PROJECT,)).fetchall()
    assert [r[0] for r in rows] == [CURR]


def test_a_deleted_baseline_is_replaced_not_served_from_cache(evals, filler_sync) -> None:
    import shutil  # noqa: PLC0415

    old = "run-old"
    old_started = "2026-09-10T00:00:00Z"
    _report(evals / PROJECT / old, [NEW_FINDING], [], old_started)
    old_snap = replace(_snapshot(PREV), job_id=f"ext-{old}", output_run_id=old, started_at=old_started)
    provider = _Provider([_snapshot(CURR), _snapshot(PREV), old_snap])
    first = build_run_log(evals, PROJECT, provider=provider, filler=filler_sync)["runs"][0]
    assert (first["baselineRunId"], first["counts"]["new"]) == (PREV, 1)
    shutil.rmtree(evals / PROJECT / PREV)
    provider = _Provider([_snapshot(CURR), old_snap])
    second = build_run_log(evals, PROJECT, provider=provider, filler=filler_sync)["runs"][0]
    assert (second["baselineRunId"], second["counts"]["new"]) == (old, 0)


def test_an_unusable_score_cache_still_answers(evals, filler_sync, monkeypatch) -> None:
    def broken_open():
        raise OSError("cache dir not creatable")

    monkeypatch.setattr("quodeq.services.run_log.open_score_cache", broken_open)
    monkeypatch.setattr("quodeq.services._run_log_fill.open_score_cache", broken_open)
    newest = build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler_sync)["runs"][0]
    assert newest["pending"] is False and newest["counts"]["new"] == 1


def test_a_second_request_does_not_rescore_cancelled_runs(evals, filler_sync, monkeypatch) -> None:
    from quodeq.services import trend_fetcher

    cancelled = "run-cancelled"
    STARTED[cancelled] = "2026-09-25T00:00:00Z"
    _report(evals / PROJECT / cancelled, [GONE_FINDING], [], STARTED[cancelled])
    status = evals / PROJECT / cancelled / "status.json"
    status.write_text(json.dumps({"state": "cancelled", "started_at": STARTED[cancelled]}), encoding="utf-8")
    dismiss_one(evals / PROJECT, GONE_FINDING)
    provider = _Provider([_snapshot(CURR), _snapshot(cancelled, status="cancelled"), _snapshot(PREV)])
    calls: list[str] = []
    real = trend_fetcher.rescore_dimension
    monkeypatch.setattr(trend_fetcher, "rescore_dimension",
                        lambda *a, **k: (calls.append(k["run_dir"].name), real(*a, **k))[1])
    first = build_run_log(evals, PROJECT, provider=provider, filler=filler_sync)
    after_first = len(calls)
    second = build_run_log(evals, PROJECT, provider=provider, filler=filler_sync)
    assert [r["runId"] for r in first["runs"]] == [CURR, cancelled, PREV]
    assert next(r for r in second["runs"] if r["runId"] == cancelled)["partial"] is True
    assert cancelled in calls
    assert calls[after_first:].count(cancelled) == 0


def test_majors_exclude_critical_findings(evals, filler_sync, monkeypatch) -> None:
    from quodeq.services import run_log

    real = run_log.ProjectRows.trend

    def trend(self):
        out = real(self)
        for entry in out:
            entry["critical"], entry["majors"] = 1, 97
            for detail in entry["dimensionDetails"]:
                detail["critical"], detail["majors"] = 1, 97
        return out

    monkeypatch.setattr(run_log.ProjectRows, "trend", trend)
    newest = build_run_log(evals, PROJECT, provider=PROVIDER, filler=filler_sync)["runs"][0]
    assert (newest["critical"], newest["majors"]) == (1, 96)
    assert newest["dimensionDetails"][0]["majors"] == 96


def test_a_cancelled_run_scored_later_is_not_served_stale(evals, filler_sync) -> None:
    cancelled = "run-cancelled-late"
    STARTED[cancelled] = "2026-09-25T00:00:00Z"
    run_dir = evals / PROJECT / cancelled
    _report(run_dir, [GONE_FINDING], [], STARTED[cancelled])
    (run_dir / "status.json").write_text(
        json.dumps({"state": "cancelled", "started_at": STARTED[cancelled]}), encoding="utf-8")
    provider = _Provider([_snapshot(CURR), _snapshot(cancelled, status="cancelled"), _snapshot(PREV)])

    def dims() -> list[str]:
        runs = build_run_log(evals, PROJECT, provider=provider, filler=filler_sync)["runs"]
        return next(r for r in runs if r["runId"] == cancelled)["dims"]

    assert dims() == [DIM]
    later = {"dimension": "reliability", "principles": [], "violations": [GONE_FINDING], "compliance": []}
    report = run_dir / "evaluation" / "reliability.json"
    report.write_text(json.dumps(later), encoding="utf-8")
    assert sorted(dims()) == sorted(["reliability", DIM])


def test_dismissing_a_cancelled_runs_finding_changes_the_next_log(evals, filler_sync) -> None:
    cancelled = "run-cancelled-dismiss"
    STARTED[cancelled] = "2026-09-25T00:00:00Z"
    run_dir = evals / PROJECT / cancelled
    _report(run_dir, [GONE_FINDING], [], STARTED[cancelled])
    (run_dir / "status.json").write_text(
        json.dumps({"state": "cancelled", "started_at": STARTED[cancelled]}), encoding="utf-8")
    provider = _Provider([_snapshot(CURR), _snapshot(cancelled, status="cancelled"), _snapshot(PREV)])

    def open_count() -> int:
        runs = build_run_log(evals, PROJECT, provider=provider, filler=filler_sync)["runs"]
        return next(r for r in runs if r["runId"] == cancelled)["open"]

    assert open_count() == 1
    dismiss_one(evals / PROJECT, GONE_FINDING)
    assert open_count() == 0
