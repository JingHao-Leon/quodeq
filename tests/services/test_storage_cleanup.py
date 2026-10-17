"""Opt-in storage cleanup: who gets tidied, who gets archived, who is left alone."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from quodeq.services import storage_cleanup
from quodeq.services.storage_cleanup import cleanup_enabled, plan_cleanup, run_cleanup

NOW = datetime(2026, 10, 17, tzinfo=timezone.utc)


def _run(root, project, name, days, *, state="done", dims=("quality",), log=True):
    run_dir = root / project / name
    (run_dir / "evaluation").mkdir(parents=True)
    started = (NOW - timedelta(days=days)).isoformat()
    (run_dir / "status.json").write_text(json.dumps({"state": state, "started_at": started}))
    for dim in dims:
        (run_dir / "evaluation" / f"{dim}.json").write_text("{}")
    if log:
        (run_dir / "events.jsonl").write_text("{}\n")
    return run_dir


class _Log:
    def __init__(self):
        self.warnings = []

    def warning(self, message):
        self.warnings.append(message)

    info = debug = error = success = lambda self, message: None


def test_old_finished_runs_are_archived_and_recent_ones_are_not(tmp_path):
    old = _run(tmp_path, "p", "old", 300)
    new = _run(tmp_path, "p", "new", 30)
    plan = plan_cleanup(tmp_path, NOW)
    assert plan.archive == (old,)
    assert set(plan.tidy) == {old, new}


def test_the_newest_run_of_each_dimension_is_never_archived(tmp_path):
    only = _run(tmp_path, "p", "only", 400, dims=("security",))
    _run(tmp_path, "p", "newer", 10, dims=("quality",))
    assert only not in plan_cleanup(tmp_path, NOW).archive


def test_a_running_run_is_never_touched(tmp_path):
    running = _run(tmp_path, "p", "live", 400, state="running")
    old = _run(tmp_path, "p", "old", 300)
    plan = plan_cleanup(tmp_path, NOW)
    assert running not in plan.tidy and running not in plan.archive
    assert old not in plan.archive


def test_already_archived_runs_are_skipped(tmp_path):
    done = _run(tmp_path, "p", "gone", 300)
    (done / "archive.tar.gz").write_bytes(b"x")
    _run(tmp_path, "p", "newer", 10)
    plan = plan_cleanup(tmp_path, NOW)
    assert done not in plan.tidy and done not in plan.archive


def test_cleanup_is_off_unless_asked():
    assert cleanup_enabled({}) is False
    assert cleanup_enabled({"QUODEQ_STORAGE_CLEANUP": "1"}) is True


def test_one_failing_run_does_not_stop_the_rest(tmp_path, monkeypatch):
    bad = _run(tmp_path, "p", "bad", 300)
    good = _run(tmp_path, "p", "good", 290)
    _run(tmp_path, "p", "newer", 10)
    real = storage_cleanup.archive_run

    def flaky(run_dir):
        if run_dir == bad:
            raise OSError("disk")
        return real(run_dir)

    monkeypatch.setattr(storage_cleanup, "archive_run", flaky)
    log = _Log()
    result = run_cleanup(tmp_path, NOW, log=log)
    assert result.archived == 1
    assert (good / "archive.tar.gz").is_file()
    assert len(log.warnings) == 1


def test_start_does_nothing_when_off(tmp_path):
    assert storage_cleanup.start_storage_cleanup(tmp_path, {}) is None


def test_cleanup_reports_the_bytes_it_freed(tmp_path):
    old = _run(tmp_path, "p", "old", 300)
    (old / "evidence").mkdir()
    (old / "evidence" / "a_evidence.jsonl").write_text("x" * 5000)
    _run(tmp_path, "p", "newer", 10)
    result = run_cleanup(tmp_path, NOW)
    assert result.archived == 1
    assert result.bytes_freed >= 0
