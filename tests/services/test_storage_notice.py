"""The first start that would archive only tidies and records the notice; the next start archives as set."""
from __future__ import annotations

import threading

from quodeq.services import storage_cleanup
from quodeq.services.storage_cleanup import run_cleanup
from quodeq.services.storage_job import CleanJob
from quodeq.services.storage_settings import (
    ArchiveNotice, StorageSettings, read_storage_settings, write_storage_settings,
)
from tests._timeouts import budget
from tests.services._storage_fixtures import NOW, make_run


def _env(tmp_path):
    return {"QUODEQ_DIR": str(tmp_path / "qdir")}


def _start(tmp_path, env, **kwargs):
    """One app start's cleanup thread, run to its end."""
    thread = storage_cleanup.start_storage_cleanup(tmp_path / "evals", env, **kwargs)
    if thread is not None:
        thread.join(budget(10))
    return thread


def _project(tmp_path):
    """One run beyond the ten newest done runs the default keeps."""
    old = make_run(tmp_path / "evals", "p", "old", 300)
    for i in range(10):
        make_run(tmp_path / "evals", "p", f"newer{i}", 10 + i)
    return old


def test_the_first_start_holds_the_archive_back_and_the_next_one_archives(tmp_path):
    old, env = _project(tmp_path), _env(tmp_path)

    _start(tmp_path, env)
    assert not (old / "archive.tar.gz").exists()
    assert read_storage_settings(env).keep_notice is ArchiveNotice.PENDING

    _start(tmp_path, env)
    assert (old / "archive.tar.gz").is_file()
    assert read_storage_settings(env).keep_notice is ArchiveNotice.DONE


def test_a_start_with_nothing_to_archive_never_raises_the_notice(tmp_path):
    env = _env(tmp_path)
    make_run(tmp_path / "evals", "p", "recent", 10)

    _start(tmp_path, env)

    assert read_storage_settings(env).keep_notice is ArchiveNotice.DONE


def test_a_setting_changed_after_the_notice_is_the_one_the_next_start_uses(tmp_path):
    old, env = _project(tmp_path), _env(tmp_path)
    _start(tmp_path, env)

    settings = read_storage_settings(env)
    write_storage_settings(StorageSettings(keep_runs=None, keep_notice=settings.keep_notice), env)
    _start(tmp_path, env)

    assert not (old / "archive.tar.gz").exists()


def test_cleanup_turned_off_in_settings_runs_no_pass(tmp_path, monkeypatch):
    old, env = _project(tmp_path), _env(tmp_path)
    write_storage_settings(StorageSettings(auto_cleanup=False, keep_notice=ArchiveNotice.DONE), env)
    tidied = []
    monkeypatch.setattr(storage_cleanup, "tidy_run", lambda d: tidied.append(d) or 0)

    _start(tmp_path, env)

    assert tidied == [] and not (old / "archive.tar.gz").exists()
    assert read_storage_settings(env).keep_notice is ArchiveNotice.DONE


def test_the_startup_pass_waits_while_a_rescore_is_owed(tmp_path):
    old, env = _project(tmp_path), _env(tmp_path)
    write_storage_settings(StorageSettings(keep_notice=ArchiveNotice.DONE), env)
    owed = iter([True, True, False])
    job = CleanJob(rescore_busy=lambda: next(owed, False))

    _start(tmp_path, env, warmup_idle=job.ready, poll_s=0.01, start_pass=job.start)

    assert next(owed, "spent") == "spent"  # asked until the rescore was done
    pause = threading.Event()
    for _ in range(int(budget(10) / 0.01)):
        if job.snapshot()["state"] == "done":
            break
        pause.wait(0.01)
    assert (old / "archive.tar.gz").is_file()


def test_a_pass_stops_when_a_rescore_starts(tmp_path):
    first = make_run(tmp_path, "p", "a-old", 300)
    second = make_run(tmp_path, "p", "b-old", 250)
    make_run(tmp_path, "p", "newer", 10)
    asked = []

    def rescore_started() -> bool:  # the rescore starts once the first run is done
        asked.append(1)
        return len(asked) > 1

    result = run_cleanup(tmp_path, NOW, keep_runs=1, should_stop=rescore_started)

    assert (first / "archive.tar.gz").is_file() and not (second / "archive.tar.gz").exists()
    assert result.archived == 1


def test_a_job_refuses_to_start_while_a_rescore_is_owed(tmp_path):
    job = CleanJob(rescore_busy=lambda: True)

    assert job.start(tmp_path, _env(tmp_path)) is False
    assert job.ready() is False
    assert storage_cleanup.CLEANUP_LOCK.locked() is False
