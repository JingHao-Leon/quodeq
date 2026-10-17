"""Cleanup keeps what History and the run page read: files analysed and a cancelled run's partly scanned dimensions."""
from __future__ import annotations

import json

from quodeq.core.observability import NULL_LOG
from quodeq.data.fs.run_archive import is_archived, tidy_run
from quodeq.services.run_log import ChangeJob, compute_run_change
from quodeq.services.scan_progress import build_scan_progress
from quodeq.services.storage_cleanup import archive_keeping_keys
from tests.services._archive_fixtures import PROJECT, make_run

_DIMS = ("security", "reliability")


def _cancelled_partial_run(root):
    """A cancelled run that scanned 3 of 4 files in each of two dimensions, with no report for the second."""
    run = make_run(root, "20250101", days=400)
    status = json.loads((run / "status.json").read_text())
    (run / "status.json").write_text(json.dumps({**status, "state": "cancelled", "dimensions": list(_DIMS)}))
    (run / "evidence").mkdir(exist_ok=True)
    for dim in _DIMS:
        queue = {"taken": [{"files": ["a.py", "b.py", "c.py"], "agent": "a1", "ts": 1}], "pending": ["d.py"]}
        (run / "evidence" / f"{dim}_queue.json").write_text(json.dumps(queue))
        (run / "evidence" / f"{dim}_dispatch_keys.json").write_text("{}")
    return run


def _rows(run):
    progress = build_scan_progress(run.name, run, tally_findings=False)
    return {d.id: (str(d.state), d.files) for d in progress.dimensions}


def test_tidy_and_archive_keep_a_cancelled_runs_partial_dimensions(tmp_path):
    run = _cancelled_partial_run(tmp_path)
    before = _rows(run)
    assert before == {dim: ("done", {"taken": 3, "total": 4}) for dim in _DIMS}

    tidy_run(run)
    archive_keeping_keys(run, NULL_LOG)

    assert is_archived(run)
    assert not (run / "evidence" / "security_dispatch_keys.json").exists()
    assert _rows(run) == before


def test_files_analysed_survives_cleanup_without_a_restore(tmp_path):
    run = _cancelled_partial_run(tmp_path)
    tidy_run(run)
    archive_keeping_keys(run, NULL_LOG)

    change = compute_run_change(ChangeJob(tmp_path, PROJECT, run.name, None, "key"))

    assert change["filesAnalysed"] == 6
    assert is_archived(run)
