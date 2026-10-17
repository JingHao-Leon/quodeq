"""sync_project: one project's runs synced like sync_index, the others untouched."""
from __future__ import annotations

from pathlib import Path

from quodeq.data.fs.run_status_store import RunState, RunStatus, write_status
from quodeq.data.sqlite.run_index import list_runs_for_project, open_index, sync_project


def _seed(root: Path, project: str, run_id: str) -> None:
    d = root / project / run_id
    (d / "evidence").mkdir(parents=True)
    (d / "evidence" / "manifest.json").write_text("{}")
    write_status(d, RunStatus(state=RunState.DONE, job_id=f"ext-{run_id}",
                 started_at="2026-04-20T00:00:00+00:00", dimensions=[]))


def test_sync_project_indexes_only_that_project(tmp_path: Path) -> None:
    reports = tmp_path / "reports"
    _seed(reports, "p1", "runA")
    _seed(reports, "p2", "runB")
    db = open_index(tmp_path / "idx.db")
    try:
        sync_project(db, reports / "p1", "p1")
        assert [r.run_id for r in list_runs_for_project(db, "p1", limit=None)] == ["runA"]
        assert db.execute("SELECT COUNT(*) FROM runs WHERE project_uuid='p2'").fetchone()[0] == 0
    finally:
        db.close()


def test_sync_project_on_a_missing_dir_is_a_no_op(tmp_path: Path) -> None:
    db = open_index(tmp_path / "idx.db")
    try:
        sync_project(db, tmp_path / "nope", "nope")
        assert list_runs_for_project(db, "nope", limit=None) == []
    finally:
        db.close()
