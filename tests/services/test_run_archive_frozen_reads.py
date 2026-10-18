"""A dismissal made after a run was archived: the run stays packed until opened, then catches up."""
from __future__ import annotations

from quodeq.core.observability import NULL_LOG
from quodeq.data.fs.run_archive import ensure_restored, is_archived
from quodeq.data.fs.run_scalars import read_scalars
from quodeq.data.sqlite.score_cache_access import read_project_rows
from quodeq.data.sqlite.state_store import SQLiteStateStore
from quodeq.services.dismissed import dismiss_finding
from quodeq.services.mutation_rescore import project_all_runs
from quodeq.services.scoring import get_scores_raw, make_scoring_trend_fetcher
from quodeq.services.storage_cleanup import archive_keeping_keys, run_cleanup
from tests.services._archive_fixtures import NOW, PROJECT, make_run

_KEY = {"req": "R1", "file": "f1.py", "line": 11}


def _dismissed(run) -> int:
    with SQLiteStateStore(run).connection() as conn:
        return conn.execute("SELECT COUNT(*) FROM findings WHERE verdict = 'dismissed'").fetchone()[0]


def _setup(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "cache.db"))
    old = make_run(tmp_path, "20250101", days=600)
    make_run(tmp_path, "20261001", days=10)
    archive_keeping_keys(old, NULL_LOG)
    dismiss_finding(tmp_path / PROJECT, {"project": PROJECT, **_KEY})
    return old


def test_a_dismissal_reaches_an_archived_run_when_it_is_restored(tmp_path, monkeypatch):
    old = _setup(tmp_path, monkeypatch)
    project_all_runs(tmp_path / PROJECT)
    assert is_archived(old)

    get_scores_raw(tmp_path, PROJECT, old.name)  # opening the run restores and projects it

    assert not is_archived(old)
    assert _dismissed(old) == 1


def test_the_trend_serves_frozen_grades_and_never_persists_them(tmp_path, monkeypatch):
    old = _setup(tmp_path, monkeypatch)
    frozen = make_scoring_trend_fetcher(tmp_path, PROJECT)(old.name)

    assert is_archived(old)
    assert frozen and not any(run_id == old.name for run_id, _ in read_project_rows(PROJECT))

    ensure_restored(old)
    caught_up = make_scoring_trend_fetcher(tmp_path, PROJECT)(old.name)

    assert [d.overall_score for d in caught_up] != [d.overall_score for d in frozen]
    assert any(run_id == old.name for run_id, _ in read_project_rows(PROJECT))


def test_cleanup_projects_a_pending_dismissal_before_it_archives(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "cache.db"))
    old = make_run(tmp_path, "20250101", days=600)
    make_run(tmp_path, "20261001", days=10)
    dismiss_finding(tmp_path / PROJECT, {"project": PROJECT, **_KEY})  # not projected into the old run yet

    run_cleanup(tmp_path, NOW, keep_runs=1)

    assert is_archived(old)
    (_dims, _principles, counts) = read_scalars(old)
    assert counts["security"].violations == 4
