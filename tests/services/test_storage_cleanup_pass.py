"""One cleanup pass: cheap in-flight checks, progress over tidy and archive, settling runs, races with other processes."""
from __future__ import annotations

import os
import time

from quodeq.data.fs.run_archive import archive_run, is_archived
from quodeq.services import storage_cleanup, storage_plan
from quodeq.services.storage_cleanup import run_cleanup
from tests.services._storage_fixtures import NOW, make_run as _run


class _Log:
    def __init__(self):
        self.warnings = []

    def warning(self, message):
        self.warnings.append(message)

    info = debug = error = success = lambda self, message: None


def _counting_status_reads(monkeypatch) -> list[int]:
    reads = [0]
    real = storage_plan.read_status

    def counted(run_dir):
        reads[0] += 1
        return real(run_dir)

    monkeypatch.setattr(storage_plan, "read_status", counted)
    return reads


def test_a_tidy_pass_reads_each_status_a_bounded_number_of_times(tmp_path, monkeypatch):
    for i in range(30):
        _run(tmp_path, "p", f"r{i:02d}", 10 + i)
    reads = _counting_status_reads(monkeypatch)

    assert run_cleanup(tmp_path, NOW, warm_days=None).tidied == 30

    assert reads[0] <= 3 * 30


def test_progress_counts_tidy_and_archive(tmp_path):
    for name, days in (("a", 300), ("b", 290)):
        _run(tmp_path, name, "old", days)
        _run(tmp_path, name, "newer", 10)
    seen = []

    run_cleanup(tmp_path, NOW, warm_days=183, on_progress=lambda d, t: seen.append((d, t)))

    assert seen == [(i, 6) for i in range(1, 7)]


def test_a_run_that_finished_minutes_ago_is_not_tidied(tmp_path):
    fresh = _run(tmp_path, "p", "fresh", 0)
    os.utime(fresh / "status.json", (time.time(), time.time()))
    (fresh / "evidence").mkdir()
    (fresh / "evidence" / "quality_queue.json").write_text("[]")

    assert run_cleanup(tmp_path, NOW, warm_days=183).tidied == 0

    assert (fresh / "evidence" / "quality_queue.json").is_file()


def test_a_run_archived_by_another_process_mid_pass_is_skipped_quietly(tmp_path, monkeypatch):
    old = _run(tmp_path, "p", "old", 300)
    gone = _run(tmp_path, "p", "gone", 290)
    _run(tmp_path, "p", "newer", 10)
    real = storage_cleanup.tidy_run

    def tidy_while_another_process_acts(run_dir):
        if not is_archived(old):
            archive_run(old)
            for path in sorted(gone.rglob("*"), reverse=True):
                path.unlink() if path.is_file() else path.rmdir()
            gone.rmdir()
        return real(run_dir) if run_dir.is_dir() else 0

    monkeypatch.setattr(storage_cleanup, "tidy_run", tidy_while_another_process_acts)
    log = _Log()

    result = run_cleanup(tmp_path, NOW, warm_days=183, log=log)

    assert log.warnings == []
    assert result.archived == 0 and is_archived(old)
