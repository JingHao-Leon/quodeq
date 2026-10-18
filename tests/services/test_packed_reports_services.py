"""Archived runs with packed reports read the same as with plain ones, through the public service entry points."""
from __future__ import annotations

import json

import pytest

from quodeq.core.observability import NULL_LOG
from quodeq.data.fs.report_parser.finding_details import read_eval_report
from quodeq.data.fs.run_archive import is_archived
from quodeq.data.fs.run_artifacts import copy_reports_plain
from quodeq.services.fs_reports import get_dashboard, get_dimension_eval
from quodeq.services.map_history import ALL_FRAMES, build_map_history
from quodeq.services.run_diff import diff_runs
from quodeq.services.scoring import get_project_scores
from quodeq.services.storage_cleanup import archive_keeping_keys
from quodeq.services.storage_plan import plan_cleanup
from tests.data.fs._report_fixtures import pack_reports
from tests.services._archive_fixtures import NOW, PROJECT, make_run

_OLD, _NEW = "run-old", "run-new"


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "qdir"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "qdir" / "score_cache.db"))
    return tmp_path


def _archived_project(root):
    old = make_run(root, _OLD, n=5, days=400)
    make_run(root, _NEW, n=7, days=10)
    cancelled = make_run(root, "run-cancelled", n=3, days=200)  # History lists it as a partial run from its report
    (cancelled / "status.json").write_text(json.dumps({"state": "cancelled", "started_at": "2026-04-01T00:00:00+00:00"}))
    for run in (old, cancelled):
        archive_keeping_keys(run, NULL_LOG)
        assert is_archived(run)
    return old


@pytest.mark.parametrize(("read", "restores"), [
    pytest.param(lambda r: get_project_scores(r, PROJECT), False, id="trend"),
    pytest.param(lambda r: diff_runs(r, PROJECT, _NEW, None, since_baseline=False), False, id="diff"),
    pytest.param(lambda r: build_map_history(r, PROJECT, frames=ALL_FRAMES, git_activity=False), False, id="map"),
    pytest.param(lambda r: get_dashboard(str(r), PROJECT, _NEW)["partialRuns"], False, id="partials"),
    # Opening a dimension's detail is opening the run: it restores, as it did before this change.
    pytest.param(lambda r: get_dimension_eval(str(r), PROJECT, _OLD, "security"), True, id="detail"),
])
def test_archived_runs_read_the_same_packed_or_plain(root, read, restores):
    old = _archived_project(root)
    before = read(root)
    if restores:
        archive_keeping_keys(old, NULL_LOG)
    pack_reports(old)
    pack_reports(root / PROJECT / "run-cancelled")
    assert read(root) == before and before
    assert is_archived(old) is not restores


def test_the_diff_still_finds_its_archived_baseline_when_packed(root):
    old = _archived_project(root)
    pack_reports(old)
    diff = diff_runs(root, PROJECT, _NEW, None, since_baseline=False)
    dims = diff.get("dimensions") or diff
    baselines = {d.get("againstRunId") for d in (dims if isinstance(dims, list) else dims.values()) if isinstance(d, dict)}
    assert _OLD in baselines


def test_the_plan_counts_the_dimensions_of_a_run_with_packed_reports(tmp_path):
    newest = make_run(tmp_path, "newest", days=10)
    older = make_run(tmp_path, "older", days=300)
    pack_reports(newest)  # an interrupted unpack left its reports packed
    plan = plan_cleanup(tmp_path, NOW, 1)
    assert plan.archive == (older,)  # newest is still the newest security run, so older is not protected


def test_publish_writes_plain_reports_from_a_packed_run(tmp_path):
    run = make_run(tmp_path, "r1")
    payload = read_eval_report(run / "evaluation", "security")
    pack_reports(run)
    written = copy_reports_plain(run / "evaluation", tmp_path / "dest" / "evaluation")
    assert [p.name for p in written] == ["security.json"]
    assert json.loads((tmp_path / "dest" / "evaluation" / "security.json").read_text()) == payload
