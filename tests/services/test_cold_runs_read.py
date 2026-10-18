"""A cold run reads exactly like the archived run it was, through the public service entry points."""
from __future__ import annotations

import json

import pytest

from quodeq.core.observability import NULL_LOG
from quodeq.data.fs.run_archive import is_archived
from quodeq.data.fs.run_cold import is_cold, trim_run
from quodeq.data.sqlite.findings_queries import read_dismissed_snippets_strict
from quodeq.data.sqlite.findings_repository import SqliteFindingsRepository
from quodeq.services.dismissed import dismiss_finding
from quodeq.services.fs_reports import get_dashboard, get_dimension_eval
from quodeq.services.map_history import ALL_FRAMES, build_map_history
from quodeq.services.run_diff import diff_runs
from quodeq.services.scoring import get_project_scores, get_scores_slim
from quodeq.services.storage_cleanup import archive_keeping_keys
from quodeq.services.storage_report import storage_summary
from tests.services._archive_fixtures import PROJECT, freeze_grades, make_run

_OLD, _NEW, _CANCELLED = "run-old", "run-new", "run-cancelled"
_SNIPPET = "digest = hashlib.md5(payload)"


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "qdir"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "qdir" / "score_cache.db"))
    return tmp_path


def _with_report_violation(run):
    """The fixture's report lists no violations; the run page regrades from the report, so give it the dismissed one."""
    path = run / "evaluation" / "security.json"
    report = json.loads(path.read_text())
    report["violations"] = [{"principle": "P1", "req": "R0", "file": "f0.py", "line": 10, "severity": "high",
                             "title": "weak hash", "reason": "r", "snippet": _SNIPPET}]
    path.write_text(json.dumps(report))


def _archived_project(root):
    old = make_run(root, _OLD, n=5, days=400, snippet=_SNIPPET)
    _with_report_violation(old)
    make_run(root, _NEW, n=7, days=10)
    cancelled = make_run(root, _CANCELLED, n=3, days=200)
    (cancelled / "status.json").write_text(json.dumps({"state": "cancelled", "started_at": "2026-04-01T00:00:00+00:00"}))
    dismiss_finding(root / PROJECT, {"project": PROJECT, "req": "R0", "file": "f0.py", "line": 10})
    SqliteFindingsRepository(old).ensure_projected()
    for run in (old, cancelled):
        freeze_grades(run)
        archive_keeping_keys(run, NULL_LOG)
        assert is_archived(run)
    return old, cancelled


@pytest.mark.parametrize("read", [
    pytest.param(lambda r: get_project_scores(r, PROJECT), id="trend"),
    pytest.param(lambda r: diff_runs(r, PROJECT, _NEW, None, since_baseline=False), id="diff"),
    pytest.param(lambda r: build_map_history(r, PROJECT, frames=ALL_FRAMES, git_activity=False), id="map"),
    pytest.param(lambda r: get_dashboard(str(r), PROJECT, _NEW)["partialRuns"], id="partials"),
    pytest.param(lambda r: read_dismissed_snippets_strict(r / PROJECT / _OLD), id="precedents"),
    # The frozen read of the archived run (what the trend shows) is what the run page gets once it is cold.
    pytest.param(lambda r: get_scores_slim(r, PROJECT, _OLD, keep_archived=True)["dimensions"], id="run-page"),
])
def test_a_cold_run_reads_like_the_archived_one(root, read):
    old, cancelled = _archived_project(root)
    before = read(root)
    for run in (old, cancelled):
        trim_run(run)
    assert read(root) == before and before
    assert is_cold(old) and not (old / "evaluation.db").exists() and not is_archived(old)


def test_the_run_page_of_a_cold_run_serves_its_frozen_grades_without_the_archived_flag(root):
    old, _ = _archived_project(root)
    frozen = get_scores_slim(root, PROJECT, _OLD, keep_archived=True)["dimensions"]
    trim_run(old)
    served = get_scores_slim(root, PROJECT, _OLD)["dimensions"]
    assert served == frozen and served
    assert not any(v.get("file") == "f0.py" and v.get("line") == 10 for v in served[0].get("violations") or [])


def test_the_detail_of_a_cold_run_opens_without_a_restore_and_hides_the_dismissed_finding(root):
    old, _ = _archived_project(root)
    trim_run(old)
    detail = get_dimension_eval(str(root), PROJECT, _OLD, "security")
    assert isinstance(detail, dict) and not (old / "evaluation.db").exists() and is_cold(old)
    assert not any(v.get("file") == "f0.py" and v.get("line") == 10 for v in detail.get("violations") or [])


def test_the_storage_summary_counts_cold_runs_as_archived_and_apart(root):
    old, cancelled = _archived_project(root)
    trim_run(old)
    summary = storage_summary(root)
    assert (summary.runs, summary.archived, summary.cold) == (3, 2, 1)
