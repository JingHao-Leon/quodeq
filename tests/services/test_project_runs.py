"""The per-project run listing syncs and reads only that project's runs."""
from __future__ import annotations

import importlib
from pathlib import Path

from quodeq.data.fs.run_status_store import RunState, RunStatus, write_status
from quodeq.services.filesystem import FilesystemActionProvider
from quodeq.services.wiring import open_index


def _seed(root: Path, project: str, run_id: str, started_at: str) -> None:
    d = root / project / run_id
    (d / "evidence").mkdir(parents=True)
    (d / "evidence" / "manifest.json").write_text("{}")
    write_status(d, RunStatus(state=RunState.DONE, job_id=f"ext-{run_id}", started_at=started_at, dimensions=[]))


def test_only_the_projects_own_runs_are_synced_and_read(tmp_path: Path, monkeypatch) -> None:
    reports, index = tmp_path / "evaluations", tmp_path / "index.db"
    _seed(reports, "p1", "old", "2026-10-01T00:00:00+00:00")
    _seed(reports, "p1", "new", "2026-10-02T00:00:00+00:00")
    for i in range(3):
        _seed(reports, "p2", f"other{i}", "2026-10-03T00:00:00+00:00")
    built: list[str] = []
    target = "quodeq.services._project_runs.build_job_snapshot"
    real = importlib.import_module(target.rsplit(".", 1)[0]).build_job_snapshot
    monkeypatch.setattr(target, lambda row, **kw: built.append(row.project_uuid) or real(row, **kw))
    provider = FilesystemActionProvider(index_db_path=index, reports_root=reports)

    snaps = provider.list_project_evaluations("p1", reports_dir=reports)

    assert [s.output_run_id for s in snaps] == ["new", "old"]
    assert built == ["p1", "p1"]
    db = open_index(index)
    try:
        assert db.execute("SELECT COUNT(*) FROM runs WHERE project_uuid='p2'").fetchone()[0] == 0
    finally:
        db.close()
