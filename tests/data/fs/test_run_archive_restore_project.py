"""When a restore rebuilds the database, when it must not, and what a restore sweeps away first."""
from __future__ import annotations

from quodeq.data.events.reader import EventLogReader
from quodeq.data.fs import run_archive
from quodeq.data.fs.run_archive import archive_run, ensure_restored, is_archived, restore_or_warn
from quodeq.data.projection.projector import ProjectionResult, Projector
from quodeq.data.sqlite.connection import open_evaluation_db
from tests.services._archive_fixtures import make_run


def _spy(monkeypatch):
    seen = []
    monkeypatch.setattr(run_archive, "_project_after_restore", lambda rd: seen.append(rd))
    return seen


def test_the_event_reader_restores_without_projecting(tmp_path, monkeypatch):
    # The projector streams the log while it holds its own per-run lock; a projection from inside
    # that restore would wait on the lock the same thread holds.
    run = make_run(tmp_path, "r1", n=3)
    archive_run(run)
    seen = _spy(monkeypatch)
    events = list(EventLogReader(run / "events.jsonl").stream())
    assert len(events) == 3 and (run / "events.jsonl").is_file()
    assert seen == [] and not (run / "evaluation.db").exists()


def test_restore_or_warn_projects_unless_told_not_to(tmp_path, monkeypatch):
    run = make_run(tmp_path, "r1")
    archive_run(run)
    seen = _spy(monkeypatch)
    assert restore_or_warn(run, project=False) and seen == []
    archive_run(run)
    assert restore_or_warn(run) and seen == [run]


def test_stray_database_sidecars_beside_an_archive_go_on_restore(tmp_path):
    run = make_run(tmp_path, "r1")
    archive_run(run)
    (run / "evaluation.db-wal").write_bytes(b"stale frames")
    (run / "evaluation.db-shm").write_bytes(b"stale index")
    assert ensure_restored(run)
    assert not (run / "evaluation.db-wal").exists() and not (run / "evaluation.db-shm").exists()
    assert (run / "evaluation.db").is_file()


def test_opening_an_archived_run_database_serves_its_findings(tmp_path):
    # The connection path restores under the run lock and must rebuild the database before it connects,
    # or a reader that never projects gets an empty store.
    run = make_run(tmp_path, "r1", n=5)
    archive_run(run)
    with open_evaluation_db(run) as conn:
        rows = conn.execute("SELECT COUNT(*) FROM findings").fetchone()[0]
    assert rows == 5 and not is_archived(run)


def test_a_nested_ensure_projected_on_the_same_thread_is_a_no_op(tmp_path):
    # A restore from inside a projection's own database open must not wait on the lock that projection holds.
    run = make_run(tmp_path, "r1", n=5)
    projector = Projector()
    with projector._locks.acquire(run):
        result = projector.ensure_projected(run / "events.jsonl", run, project_dir=run.parent)
    assert result == ProjectionResult(events_projected=0, rebuilt=False)
