"""The "clean now" job: single flight with the startup pass, progress and outcome."""
from __future__ import annotations

import threading

from quodeq.services import storage_cleanup, storage_job
from quodeq.services.storage_cleanup import CleanupResult
from quodeq.services.storage_job import CleanJob
from tests._timeouts import budget
from tests.services._storage_fixtures import make_run as _run


def _env(tmp_path):
    return {"QUODEQ_DIR": str(tmp_path / "qdir")}


def _wait(job, state):
    deadline = threading.Event()
    for _ in range(int(budget(10) / 0.01)):
        if job.snapshot()["state"] == state:
            return True
        deadline.wait(0.01)
    return False


def test_a_fresh_job_is_idle():
    assert CleanJob().snapshot() == {"state": "idle", "done": 0, "total": 0, "archived": 0, "bytesFreed": 0}


def test_the_job_archives_and_reports_done(tmp_path):
    root = tmp_path / "evals"
    old = _run(root, "p", "old", 400)
    for i in range(10):  # the default keeps ten runs; the eleventh is archived
        _run(root, "p", f"newer{i}", 10 + i)
    job = CleanJob()
    assert job.start(root, _env(tmp_path)) is True
    assert _wait(job, "done")
    snap = job.snapshot()
    assert (snap["archived"], snap["done"], snap["total"]) == (1, 11, 11)  # eleven runs: all tidied, one archived
    assert (old / "archive.tar.gz").is_file()
    assert storage_cleanup.CLEANUP_LOCK.locked() is False


def test_a_second_start_while_running_returns_false(tmp_path, monkeypatch):
    release = threading.Event()
    entered = threading.Event()

    def slow(*_a, **_k):
        entered.set()
        release.wait(budget(10))
        return CleanupResult(0, 0, 0)

    monkeypatch.setattr(storage_job, "run_cleanup", slow)
    job = CleanJob()
    assert job.start(tmp_path, _env(tmp_path)) is True
    assert entered.wait(budget(10))
    assert job.start(tmp_path, _env(tmp_path)) is False
    assert job.snapshot()["state"] == "running"
    release.set()
    assert _wait(job, "done")
    assert job.start(tmp_path, _env(tmp_path)) is True
    assert _wait(job, "done")


def test_start_returns_false_while_the_startup_pass_holds_the_lock(tmp_path):
    job = CleanJob()
    with storage_cleanup.CLEANUP_LOCK:
        assert job.start(tmp_path, _env(tmp_path)) is False
    assert job.snapshot()["state"] == "idle"


def test_a_failing_pass_reports_failed_and_frees_the_lock(tmp_path, monkeypatch):
    def boom(*_a, **_k):
        raise OSError("disk")

    monkeypatch.setattr(storage_job, "run_cleanup", boom)
    job = CleanJob()
    assert job.start(tmp_path, _env(tmp_path)) is True
    assert _wait(job, "failed")
    assert storage_cleanup.CLEANUP_LOCK.locked() is False


def test_the_job_reads_the_saved_window_at_start(tmp_path):
    from quodeq.services.storage_settings import StorageSettings, write_storage_settings
    root = tmp_path / "evals"
    old = _run(root, "p", "old", 400)
    _run(root, "p", "newer", 10)
    write_storage_settings(StorageSettings(archive_after_days=None), _env(tmp_path))
    job = CleanJob()
    assert job.start(root, _env(tmp_path)) is True
    assert _wait(job, "done")
    assert job.snapshot()["archived"] == 0 and not (old / "archive.tar.gz").exists()
