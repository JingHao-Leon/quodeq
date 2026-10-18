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
from quodeq.services.scoring import get_project_scores
from quodeq.services.storage_cleanup import archive_keeping_keys
from quodeq.services.storage_report import storage_summary
from tests.services._archive_fixtures import PROJECT, make_run

_OLD, _NEW, _CANCELLED = "run-old", "run-new", "run-cancelled"
_SNIPPET = "digest = hashlib.md5(payload)"


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "qdir"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "qdir" / "score_cache.db"))
    return tmp_path


def _archived_project(root):
    old = make_run(root, _OLD, n=5, days=400, snippet=_SNIPPET)
    make_run(root, _NEW, n=7, days=10)
    cancelled = make_run(root, _CANCELLED, n=3, days=200)
    (cancelled / "status.json").write_text(json.dumps({"state": "cancelled", "started_at": "2026-04-01T00:00:00+00:00"}))
    dismiss_finding(root / PROJECT, {"project": PROJECT, "req": "R0", "file": "f0.py", "line": 10})
    SqliteFindingsRepository(old).ensure_projected()
    for run in (old, cancelled):
        archive_keeping_keys(run, NULL_LOG)
        assert is_archived(run)
    return old, cancelled


@pytest.mark.parametrize(("read", "restores"), [
    pytest.param(lambda r: get_project_scores(r, PROJECT), False, id="trend"),
    pytest.param(lambda r: diff_runs(r, PROJECT, _NEW, None, since_baseline=False), False, id="diff"),
    pytest.param(lambda r: build_map_history(r, PROJECT, frames=ALL_FRAMES, git_activity=False), False, id="map"),
    # Opening the detail restores an archived run; a cold run has nothing to restore and reads the same.
    pytest.param(lambda r: get_dimension_eval(str(r), PROJECT, _OLD, "security"), True, id="detail"),
    pytest.param(lambda r: get_dashboard(str(r), PROJECT, _NEW)["partialRuns"], False, id="partials"),
    pytest.param(lambda r: read_dismissed_snippets_strict(r / PROJECT / _OLD), False, id="precedents"),
])
def test_a_cold_run_reads_like_the_archived_one(root, read, restores):
    old, cancelled = _archived_project(root)
    before = read(root)
    if restores:
        archive_keeping_keys(old, NULL_LOG)
    for run in (old, cancelled):
        trim_run(run)
    assert read(root) == before and before
    assert is_cold(old) and not (old / "evaluation.db").exists() and not is_archived(old)


def test_the_storage_summary_counts_cold_runs_as_archived_and_apart(root):
    old, cancelled = _archived_project(root)
    trim_run(old)
    summary = storage_summary(root)
    assert (summary.runs, summary.archived, summary.cold) == (3, 2, 1)
