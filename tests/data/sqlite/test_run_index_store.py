"""RunIndexStore owns its connection: each call opens and closes the index."""
from __future__ import annotations

from pathlib import Path

from quodeq.data.fs.run_status_store import RunState, RunStatus, write_status
from quodeq.data.sqlite import run_index
from quodeq.data.sqlite.run_index_store import RunIndexStore


def _seed(root: Path, project: str, run_id: str) -> None:
    d = root / project / run_id
    (d / "evidence").mkdir(parents=True)
    (d / "evidence" / "manifest.json").write_text("{}")
    write_status(d, RunStatus(state=RunState.DONE, job_id=f"ext-{run_id}",
                              started_at="2026-10-01T00:00:00+00:00", dimensions=[]))


def test_sync_list_get_delete_rebuild(tmp_path: Path, monkeypatch) -> None:
    reports = tmp_path / "evaluations"
    _seed(reports, "p1", "r1")
    _seed(reports, "p2", "r2")
    opened: list[object] = []
    real_open = run_index.open_index
    monkeypatch.setattr(run_index, "open_index", lambda path: opened.append(path) or real_open(path))
    store = RunIndexStore(tmp_path / "index.db")

    assert {r.job_id for r in store.synced_runs(reports, limit=None, states=None)} == {"ext-r1", "ext-r2"}
    assert [r.job_id for r in store.synced_project_runs(reports, "p1")] == ["ext-r1"]
    store.delete("ext-r1", "ext-missing")
    assert store.get("ext-r1") is None
    assert store.get("ext-r2") is not None
    assert store.rebuild(reports)[0] == 2
    assert len(opened) == 6  # one open per call, none held between calls
