"""The trim: which archived runs go cold, when the pass does it, and what the preview says."""
from __future__ import annotations

import json
import os
from datetime import timedelta

from quodeq.core.observability import NULL_LOG
from quodeq.data.fs.run_archive import ensure_restored, is_archived
from quodeq.data.fs.run_cold import is_cold, trim_run
from quodeq.services import storage_cleanup
from quodeq.services.storage_cleanup import ColdPolicy, archive_keeping_keys, run_cleanup
from quodeq.services.storage_plan import plan_cleanup
from quodeq.services.storage_report import clean_preview
from quodeq.services.storage_settings import ArchiveNotice, StorageSettings, read_storage_settings, write_storage_settings
from tests._timeouts import budget
from tests.services._archive_fixtures import NOW, freeze_grades, make_run


def _archived(root, run_id, days):
    run = freeze_grades(make_run(root, run_id, days=days))
    archive_keeping_keys(run, NULL_LOG)
    assert is_archived(run)
    return run


def _project(root):
    """Six runs: the plan must trim exactly ``old``."""
    old = _archived(root, "old", 400)
    _archived_ago(old, 120)
    young = _archived(root, "young", 30)
    bare = make_run(root, "bare", days=400)
    archive_keeping_keys(bare, NULL_LOG)
    (bare / "scalars.json").write_text('{"version": 1, "dimensions": [], "principles": [], "counts": {}}')  # archived before any grade was computed: nothing to freeze
    _archived_ago(bare, 400)
    cold = _archived(root, "cold", 400)
    trim_run(cold)
    warm_old = make_run(root, "warm-old", days=300)
    make_run(root, "newest", days=1)
    return old, young, bare, cold, warm_old


def _archived_ago(run, days):
    """Make the run look archived *days* ago: the frozen-grades sidecar is written at archive time."""
    stamp = int((NOW - timedelta(days=days)).timestamp())
    os.utime(run / "scalars.json", (stamp, stamp))


def test_the_period_counts_from_the_archive_time_not_the_run_start(tmp_path):
    old = freeze_grades(make_run(tmp_path, "old", days=400))  # started long ago...
    archive_keeping_keys(old, NULL_LOG)
    _archived_ago(old, 10)  # ...but archived last week
    make_run(tmp_path, "newest", days=1)
    assert plan_cleanup(tmp_path, NOW, 1, cold_after_days=91).trim == ()
    _archived_ago(old, 100)
    assert plan_cleanup(tmp_path, NOW, 1, cold_after_days=91).trim == (old,)


def test_a_half_trimmed_run_is_finished_by_the_next_pass_and_never_restored(tmp_path):
    run = _archived(tmp_path, "half", 400)
    make_run(tmp_path, "newest", days=1)
    (run / "cold.json").write_text('{"since": "2026-10-18T00:00:00+00:00", "archive_bytes": 1}')  # the unlink was interrupted
    assert ensure_restored(run) is False and (run / "archive.tar.gz").is_file()
    assert plan_cleanup(tmp_path, NOW, 1).trim == (run,)  # finished whatever the period
    result = run_cleanup(tmp_path, NOW, keep_runs=1)
    assert result.trimmed == 1 and not (run / "archive.tar.gz").exists() and is_cold(run)


def test_a_cold_run_takes_no_warm_slot(tmp_path):
    cold = _archived(tmp_path, "cold", 1)  # the newest by start, cold
    trim_run(cold)
    older = make_run(tmp_path, "older", days=300)
    make_run(tmp_path, "newest-warm", days=2)
    plan = plan_cleanup(tmp_path, NOW, 1)
    assert cold not in plan.tidy and plan.archive == (older,)


def test_the_plan_trims_old_archived_runs_with_frozen_grades_only(tmp_path):
    old, young, bare, cold, warm_old = _project(tmp_path)
    plan = plan_cleanup(tmp_path, NOW, 1, cold_after_days=91)
    assert plan.trim == (old,)
    assert plan.archive == (warm_old,) and cold not in plan.pack
    assert plan_cleanup(tmp_path, NOW, 1).trim == ()  # no period chosen: nothing goes cold


def test_the_pass_trims_and_counts_the_archive_bytes(tmp_path):
    old, *_ = _project(tmp_path)
    size = (old / "archive.tar.gz").stat().st_size
    result = run_cleanup(tmp_path, NOW, keep_runs=1, cold=ColdPolicy(cold_after_days=91))
    assert result.trimmed == 1 and result.bytes_freed >= size
    assert is_cold(old) and not (old / "archive.tar.gz").exists()


def test_an_in_flight_project_holds_its_trims(tmp_path):
    old, *_ = _project(tmp_path)
    live = make_run(tmp_path, "live", days=0)
    (live / "status.json").write_text(json.dumps({"state": "running", "started_at": NOW.isoformat()}))
    assert plan_cleanup(tmp_path, NOW, 1, cold_after_days=91).trim == ()


def _start(root, env):
    thread = storage_cleanup.start_storage_cleanup(root, env)
    if thread is not None:
        thread.join(budget(10))


def test_the_held_first_start_does_not_trim(tmp_path):
    root, env = tmp_path / "evals", {"QUODEQ_DIR": str(tmp_path / "qdir")}
    old = _archived(root, "old", 400)
    _archived_ago(old, 120)
    make_run(root, "newest", days=1)
    write_storage_settings(StorageSettings(keep_runs=5, cold_after_days=91), env)
    _start(root, env)
    assert is_archived(old) and read_storage_settings(env).keep_notice is ArchiveNotice.PENDING
    _start(root, env)
    assert is_cold(old)


def test_the_preview_counts_trims_and_their_archive_bytes(tmp_path):
    old, *_ = _project(tmp_path)
    size = (old / "archive.tar.gz").stat().st_size
    without = clean_preview(tmp_path, NOW, 1)
    with_trim = clean_preview(tmp_path, NOW, 1, cold_after_days=91)
    assert (without.trim, with_trim.trim) == (0, 1)
    assert with_trim.frees == without.frees + size
