"""The plan archives by count: the newest done runs of a project stay warm, restored runs for 30 days."""
from __future__ import annotations

from datetime import timedelta

from quodeq.data.fs.run_archive_guard import RESTORED_STAMP
from quodeq.services.storage_plan import CleanupPlan, plan_cleanup
from tests.services._storage_fixtures import NOW, make_run


def _project(root, done=12, cancelled=2):
    runs = [make_run(root, "p", f"d{i}", days=i + 1) for i in range(done)]
    # Cancelled runs start earlier than every done run, so d0 stays the newest terminal run per dimension.
    runs += [make_run(root, "p", f"c{i}", days=i + 20, state="cancelled") for i in range(cancelled)]
    return runs


def test_the_newest_done_runs_stay_and_the_rest_are_archived(tmp_path):
    runs = _project(tmp_path)
    plan = plan_cleanup(tmp_path, NOW, 10)
    assert sorted(p.name for p in plan.archive) == ["c0", "c1", "d10", "d11"]
    assert len(plan.tidy) == len(runs)


def test_cancelled_runs_are_never_warm_but_the_newest_terminal_is_protected(tmp_path):
    make_run(tmp_path, "p", "c-new", days=1, state="cancelled")
    make_run(tmp_path, "p", "c-old", days=2, state="cancelled")
    make_run(tmp_path, "p", "d-new", days=3)
    plan = plan_cleanup(tmp_path, NOW, 1)
    assert [p.name for p in plan.archive] == ["c-old"]


def test_keep_all_archives_nothing(tmp_path):
    _project(tmp_path)
    assert plan_cleanup(tmp_path, NOW, None).archive == ()


def test_runs_without_a_start_time_are_never_archived(tmp_path):
    _project(tmp_path, done=3)
    odd = make_run(tmp_path, "p", "odd", days=50)
    (odd / "status.json").write_text('{"state": "done"}')
    assert odd not in plan_cleanup(tmp_path, NOW, 1).archive


def test_a_restored_run_is_warm_for_thirty_days(tmp_path):
    _project(tmp_path, done=3)
    fresh = make_run(tmp_path, "p", "fresh", days=40)
    stale = make_run(tmp_path, "p", "stale", days=41)
    (fresh / RESTORED_STAMP).write_text((NOW - timedelta(days=29)).isoformat())
    (stale / RESTORED_STAMP).write_text((NOW - timedelta(days=31)).isoformat())
    archived = {p.name for p in plan_cleanup(tmp_path, NOW, 1).archive}
    assert "stale" in archived and "fresh" not in archived


def test_a_run_in_flight_still_holds_its_whole_project(tmp_path):
    _project(tmp_path, done=3)
    make_run(tmp_path, "p", "live", days=0, state="running")
    assert plan_cleanup(tmp_path, NOW, 1) == CleanupPlan((), (), ())
