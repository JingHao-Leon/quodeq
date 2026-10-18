"""Storage facts: sizes, run counts, the clean preview and delete all."""
from __future__ import annotations

import json
import subprocess
import sys
import os

import pytest

from quodeq.services import storage_cleanup
from quodeq.services.storage_report import (
    ARCHIVE_SAVING,
    CleanPreview,
    StorageBusyError,
    clean_preview,
    delete_all_evaluations,
    dir_size,
    storage_summary,
)
from tests.services._storage_fixtures import NOW, FakeProvider as _Provider, make_run as _run


def test_dir_size_skips_dotfiles_and_symlinks(tmp_path):
    (tmp_path / "a").write_bytes(b"x" * 10)
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "b").write_bytes(b"y" * 5)
    (tmp_path / ".archive.lock").write_bytes(b"z" * 100)
    (tmp_path / "link").symlink_to(tmp_path / "a")
    assert dir_size(tmp_path) == 15


def test_dir_size_of_a_missing_dir_is_zero(tmp_path):
    assert dir_size(tmp_path / "nope") == 0


def test_summary_counts_runs_and_archives_per_project(tmp_path):
    _run(tmp_path, "p", "r1", 300)
    gone = _run(tmp_path, "p", "r2", 200)
    (gone / "archive.tar.gz").write_bytes(b"a" * 7)
    _run(tmp_path, "q", "r1", 10)
    (tmp_path / "q" / "not-a-run").mkdir()
    summary = storage_summary(tmp_path)
    by_id = {p.project_id: p for p in summary.projects}
    assert (by_id["p"].runs, by_id["p"].archived) == (2, 1)
    assert (by_id["q"].runs, by_id["q"].archived) == (1, 0)
    assert (summary.runs, summary.archived) == (3, 1)
    assert summary.bytes == dir_size(tmp_path / "p") + dir_size(tmp_path / "q") > 0


def test_summary_of_an_empty_or_missing_root_is_zeros(tmp_path):
    for root in (tmp_path, tmp_path / "missing"):
        summary = storage_summary(root)
        assert (summary.bytes, summary.runs, summary.archived, summary.projects) == (0, 0, 0, ())


def test_preview_estimates_the_saving_of_the_runs_it_would_archive(tmp_path):
    old = _run(tmp_path, "p", "old", 300)
    (old / "events.jsonl").write_bytes(b"e" * 1000)
    (old / "evaluation.db").write_bytes(b"d" * 3000)
    (old / "evidence").mkdir()
    (old / "evidence" / "quality_evidence.jsonl").write_bytes(b"v" * 6000)
    (old / "evidence" / "manifest.json").write_bytes(b"m" * 400)
    _run(tmp_path, "p", "newer", 10)
    # The database (3000) goes in full; the event log and evidence (7000) are packed at ARCHIVE_SAVING.
    assert clean_preview(tmp_path, NOW, 1) == CleanPreview(archive=1, frees=int(3000 + ARCHIVE_SAVING * 7000))


def test_preview_with_never_is_zero(tmp_path):
    _run(tmp_path, "p", "old", 300)
    _run(tmp_path, "p", "newer", 10)
    assert clean_preview(tmp_path, NOW, None) == CleanPreview(archive=0, frees=0)


def test_delete_all_refuses_while_a_run_is_in_flight(tmp_path):
    _run(tmp_path, "p", "old", 300)
    _run(tmp_path, "q", "live", 1, state="running")
    provider = _Provider()
    with pytest.raises(StorageBusyError) as caught:
        delete_all_evaluations(provider, tmp_path)
    assert caught.value.projects == ("q",)
    assert provider.deleted == [] and (tmp_path / "p").is_dir()


def test_delete_all_refuses_while_a_live_process_runs(tmp_path):
    _run(tmp_path, "q", "live", 1, state="running", pid=os.getpid())
    with pytest.raises(StorageBusyError):
        delete_all_evaluations(_Provider(), tmp_path)


def _dead_pid():
    proc = subprocess.Popen([sys.executable, "-c", "pass"])
    proc.wait()
    return proc.pid


def test_a_crashed_run_with_a_dead_pid_does_not_block_delete_all(tmp_path):
    _run(tmp_path, "q", "crashed", 1, state="running", pid=_dead_pid())
    assert delete_all_evaluations(_Provider(), tmp_path) == 1


def test_delete_all_refuses_while_a_clean_holds_the_lock(tmp_path):
    _run(tmp_path, "p", "old", 300)
    provider = _Provider()
    with storage_cleanup.CLEANUP_LOCK, pytest.raises(StorageBusyError):
        delete_all_evaluations(provider, tmp_path)
    assert provider.deleted == []


def test_delete_all_removes_every_project_once_and_skips_cascaded_children(tmp_path):
    _run(tmp_path, "parent", "r", 300)
    _run(tmp_path, "child", "r", 300)
    (tmp_path / "child" / "repository_info.json").write_text(json.dumps({"parent": "parent"}))
    _run(tmp_path, "other", "r", 30)
    provider = _Provider()
    assert delete_all_evaluations(provider, tmp_path) == 3
    assert sorted(provider.deleted) == ["other", "parent"]
    assert provider.invalidated is True
    assert [p for p in tmp_path.iterdir()] == []
    assert storage_cleanup.CLEANUP_LOCK.locked() is False


def test_delete_all_leaves_folders_that_are_not_projects(tmp_path):
    _run(tmp_path, "proj", "r", 300)
    (tmp_path / "registered").mkdir()
    (tmp_path / "registered" / "repository_info.json").write_text(json.dumps({"name": "r"}))
    (tmp_path / "src" / "module").mkdir(parents=True)  # an evaluations folder pointed at a repository
    (tmp_path / "src" / "module" / "code.py").write_text("x = 1")
    (tmp_path / "notes").mkdir()
    provider = _Provider()

    assert delete_all_evaluations(provider, tmp_path) == 2

    assert sorted(provider.deleted) == ["proj", "registered"]
    assert (tmp_path / "src" / "module" / "code.py").is_file() and (tmp_path / "notes").is_dir()


def test_delete_all_on_a_missing_root_deletes_nothing(tmp_path):
    assert delete_all_evaluations(_Provider(), tmp_path / "missing") == 0


def test_a_run_started_during_delete_all_keeps_its_project(tmp_path):
    _run(tmp_path, "a", "r", 300)
    _run(tmp_path, "b", "r", 300)

    class _StartsARun(_Provider):
        def delete_project(self, reports_dir, project):
            if project == "a":
                _run(tmp_path, "b", "live", 0, state="running", pid=os.getpid())
            return super().delete_project(reports_dir, project)

    provider = _StartsARun()
    assert delete_all_evaluations(provider, tmp_path) == 1
    assert provider.deleted == ["a"] and (tmp_path / "b" / "live").is_dir()
