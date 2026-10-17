"""Opt-in storage cleanup: who gets tidied, who gets archived, who is left alone."""
from __future__ import annotations

import json

from quodeq.services import storage_cleanup
from quodeq.services.storage_cleanup import cleanup_enabled, plan_cleanup, run_cleanup
from quodeq.services.storage_notice import mark_archive_notice_done
from tests._timeouts import budget
from tests.services._storage_fixtures import NOW, make_run as _run


class _Log:
    def __init__(self):
        self.warnings = []

    def warning(self, message):
        self.warnings.append(message)

    info = debug = error = success = lambda self, message: None


def _env(tmp_path):
    return {"QUODEQ_DIR": str(tmp_path / "qdir")}


def _later_start_env(tmp_path):
    """An env whose storage.json says a start already showed the first-start notice."""
    env = _env(tmp_path)
    mark_archive_notice_done(env)
    return env


def test_old_finished_runs_are_archived_and_recent_ones_are_not(tmp_path):
    old = _run(tmp_path, "p", "old", 300)
    new = _run(tmp_path, "p", "new", 30)
    plan = plan_cleanup(tmp_path, NOW, 183)
    assert plan.archive == (old,)
    assert set(plan.tidy) == {old, new}


def test_the_newest_run_of_each_dimension_is_never_archived(tmp_path):
    only = _run(tmp_path, "p", "only", 400, dims=("security",))
    _run(tmp_path, "p", "newer", 10, dims=("quality",))
    assert only not in plan_cleanup(tmp_path, NOW, 183).archive


def test_a_running_run_is_never_touched(tmp_path):
    running = _run(tmp_path, "p", "live", 400, state="running")
    old = _run(tmp_path, "p", "old", 300)
    plan = plan_cleanup(tmp_path, NOW, 183)
    assert running not in plan.tidy and running not in plan.archive
    assert old not in plan.archive


def test_already_archived_runs_are_skipped(tmp_path):
    done = _run(tmp_path, "p", "gone", 300)
    (done / "archive.tar.gz").write_bytes(b"x")
    _run(tmp_path, "p", "newer", 10)
    plan = plan_cleanup(tmp_path, NOW, 183)
    assert done not in plan.tidy and done not in plan.archive


def test_cleanup_is_on_unless_switched_off(tmp_path):
    assert cleanup_enabled({}) is True
    assert cleanup_enabled(_env(tmp_path)) is True
    assert cleanup_enabled({"QUODEQ_STORAGE_CLEANUP": "0"}) is False


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
    result = run_cleanup(tmp_path, NOW, warm_days=183, log=log)
    assert result.archived == 1
    assert (good / "archive.tar.gz").is_file()
    assert len(log.warnings) == 1


def test_start_does_nothing_when_off(tmp_path):
    assert storage_cleanup.start_storage_cleanup(tmp_path, {"QUODEQ_STORAGE_CLEANUP": "0"}) is None


def test_cleanup_reports_the_bytes_it_freed(tmp_path):
    old = _run(tmp_path, "p", "old", 300)
    (old / "evidence").mkdir()
    (old / "evidence" / "a_evidence.jsonl").write_text("x" * 5000)
    _run(tmp_path, "p", "newer", 10)
    result = run_cleanup(tmp_path, NOW, warm_days=183)
    assert result.archived == 1
    assert result.bytes_freed > 0


def test_the_hook_accepts_a_string_root_and_archives(tmp_path):
    old = _run(tmp_path, "p", "old", 300)
    _run(tmp_path, "p", "newer", 10)
    thread = storage_cleanup.start_storage_cleanup(str(tmp_path), _later_start_env(tmp_path))
    thread.join(budget(30))
    assert (old / "archive.tar.gz").is_file()


def test_legacy_state_spellings_count_as_finished(tmp_path):
    old = _run(tmp_path, "p", "old", 300, state="completed")
    _run(tmp_path, "p", "newer", 10)
    assert plan_cleanup(tmp_path, NOW, 183).archive == (old,)


def test_a_live_run_without_a_start_time_still_blocks_its_project(tmp_path):
    old = _run(tmp_path, "p", "old", 300)
    live = _run(tmp_path, "p", "live", 5, state="running")
    (live / "status.json").write_text(json.dumps({"state": "running"}))
    _run(tmp_path, "p", "newer", 10)
    plan = plan_cleanup(tmp_path, NOW, 183)
    assert old not in plan.archive and old not in plan.tidy


def test_the_newest_done_and_newest_terminal_runs_both_stay(tmp_path):
    done = _run(tmp_path, "p", "done", 400, dims=("security",))
    cancelled = _run(tmp_path, "p", "cancelled", 300, state="cancelled", dims=("security",))
    plan = plan_cleanup(tmp_path, NOW, 183)
    assert done not in plan.archive and cancelled not in plan.archive


def test_cleanup_waits_for_the_warmup(tmp_path):
    old = _run(tmp_path, "p", "old", 300)
    _run(tmp_path, "p", "newer", 10)
    answers = iter([False, False, True])
    calls = []

    def idle():
        calls.append(1)
        return next(answers)

    thread = storage_cleanup.start_storage_cleanup(
        tmp_path, _later_start_env(tmp_path), warmup_idle=idle, poll_s=0.01)
    thread.join(budget(30))
    assert len(calls) == 3
    assert (old / "archive.tar.gz").is_file()


def test_a_never_window_archives_nothing(tmp_path):
    old = _run(tmp_path, "p", "old", 300)
    _run(tmp_path, "p", "newer", 10)
    assert plan_cleanup(tmp_path, NOW, None).archive == ()
    assert plan_cleanup(tmp_path, NOW, 183).archive == (old,)
    assert run_cleanup(tmp_path, NOW, warm_days=None).archived == 0


def test_a_shorter_window_archives_younger_runs(tmp_path):
    mid = _run(tmp_path, "p", "mid", 120)
    _run(tmp_path, "p", "newer", 10)
    assert plan_cleanup(tmp_path, NOW, 183).archive == ()
    assert plan_cleanup(tmp_path, NOW, 91).archive == (mid,)


def test_try_run_cleanup_is_busy_while_the_lock_is_held(tmp_path):
    with storage_cleanup.CLEANUP_LOCK:
        assert storage_cleanup.try_run_cleanup(tmp_path, NOW, warm_days=183) is None
    assert storage_cleanup.try_run_cleanup(tmp_path, NOW, warm_days=183) is not None


def test_the_hook_reads_the_saved_window_when_it_runs(tmp_path):
    from quodeq.services.storage_settings import StorageSettings, write_storage_settings
    old = _run(tmp_path, "p", "old", 300)
    _run(tmp_path, "p", "newer", 10)
    env = _env(tmp_path)
    write_storage_settings(StorageSettings(archive_after_days=None), env)
    thread = storage_cleanup.start_storage_cleanup(tmp_path, env)
    thread.join(budget(30))
    assert not (old / "archive.tar.gz").exists()


def test_a_project_that_starts_a_run_after_the_plan_is_not_tidied(tmp_path, monkeypatch):
    _run(tmp_path, "p", "old", 300)
    tidied = []
    monkeypatch.setattr(storage_cleanup, "tidy_run", lambda d: tidied.append(d) or 0)
    monkeypatch.setattr(storage_cleanup, "project_in_flight", lambda project: True)
    result = run_cleanup(tmp_path, NOW, warm_days=183)
    assert tidied == [] and result.tidied == 0
