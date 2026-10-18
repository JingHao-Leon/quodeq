"""The first-start notice belongs to the count rule: one held start on every installation, old notice or not."""
from __future__ import annotations

from quodeq.services import storage_cleanup
from quodeq.services.storage_report import next_start_archive
from quodeq.services.storage_settings import (
    ArchiveNotice, StorageSettings, read_storage_settings, write_storage_settings,
)
from tests._timeouts import budget
from tests.services._storage_fixtures import NOW, make_run


def _env(tmp_path):
    return {"QUODEQ_DIR": str(tmp_path / "qdir")}


def _start(tmp_path, env):
    thread = storage_cleanup.start_storage_cleanup(tmp_path / "evals", env)
    if thread is not None:
        thread.join(budget(10))


def _twelve_runs(tmp_path):
    for i in range(12):
        make_run(tmp_path / "evals", "p", f"d{i}", days=i + 1)


def test_an_installation_past_the_old_notice_gets_one_more_held_start(tmp_path):
    env = _env(tmp_path)
    write_storage_settings(StorageSettings(archive_notice=ArchiveNotice.DONE), env)
    _twelve_runs(tmp_path)
    _start(tmp_path, env)
    assert not any((tmp_path / "evals" / "p" / f"d{i}" / "archive.tar.gz").exists() for i in range(12))
    assert read_storage_settings(env).keep_notice is ArchiveNotice.PENDING
    _start(tmp_path, env)
    assert (tmp_path / "evals" / "p" / "d11" / "archive.tar.gz").exists()
    assert read_storage_settings(env).keep_notice is ArchiveNotice.DONE


def test_keep_all_records_done_at_once_and_shows_no_notice(tmp_path):
    env = _env(tmp_path)
    write_storage_settings(StorageSettings(keep_runs=None), env)
    _twelve_runs(tmp_path)
    _start(tmp_path, env)
    settings = read_storage_settings(env)
    assert settings.keep_notice is ArchiveNotice.DONE
    assert next_start_archive(tmp_path / "evals", NOW, settings, cleanup_on=True) is None
