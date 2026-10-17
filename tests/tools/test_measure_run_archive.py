"""The archive measuring tool times a real rebuild, not a no-op on the restored database."""
from __future__ import annotations

import measure_run_archive

from tests.api._scores_routes_helpers import _scorable_violations, _seed_run


def test_the_rebuild_column_projects_without_the_restored_database(tmp_path, monkeypatch):
    run = _seed_run(tmp_path, "proj", "run-1", _scorable_violations(3))
    seen = []

    class Recorder:
        def ensure_projected(self, events_path, run_dir, *, project_dir=None):
            seen.append((run_dir / "evaluation.db").exists())

    monkeypatch.setattr(measure_run_archive, "Projector", Recorder)
    row = measure_run_archive._measure(run)
    assert seen == [False]
    assert row[0] == "run-1"[:8] and row[4] > 0
