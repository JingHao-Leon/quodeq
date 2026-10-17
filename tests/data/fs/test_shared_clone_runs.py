"""Runs inside a shared clone: detection, the kept-archive unpack, the local-database marker, git excludes."""
from __future__ import annotations

import os
import sqlite3
import subprocess
from pathlib import Path

import pytest

from quodeq.data.fs import run_archive
from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, RESTORED_STAMP, archive_run, ensure_restored, is_archived
from quodeq.data.fs.shared_clone_runs import (
    CLONE_EXCLUDES,
    local_db_marker,
    secure_clone_tree,
    unpacked_marker,
    is_shared_clone_run,
    write_clone_excludes,
)
from quodeq.data.sqlite.connection import open_evaluation_db

_EVENTS = '{"type": "finding"}\n' * 50
_EVIDENCE = "evidence/security_evidence.jsonl"


def _git(*args: str, cwd: Path) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def _sentinel_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE sentinel_marker (v TEXT)")
    conn.execute("INSERT INTO sentinel_marker VALUES ('foreign')")
    conn.commit()
    conn.close()


def _tables(path: Path) -> set[str]:
    conn = sqlite3.connect(path)
    try:
        return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    finally:
        conn.close()


def _run(root: Path) -> Path:
    run = root / "evaluations" / "proj" / "run-1"
    (run / "evidence").mkdir(parents=True)
    (run / "events.jsonl").write_text(_EVENTS)
    (run / _EVIDENCE).write_text('{"p": 1}\n')
    (run / "status.json").write_text('{"state": "done"}')
    return run


@pytest.fixture
def clone_run(tmp_path: Path) -> Path:
    """An archived run (database with a sentinel table packed inside) in a git clone with the repo marker."""
    repo = tmp_path / "repo"
    run = _run(repo)
    (repo / "quodeq.json").write_text('{"format": "quodeq-shared-evaluations", "version": 1}')
    _git("init", "-q", cwd=repo)
    _sentinel_db(run / "evaluation.db")
    archive_run(run)
    return run


def test_a_local_evaluations_root_is_never_a_clone(tmp_path):
    run = _run(tmp_path / "qdir")
    assert not is_shared_clone_run(run)
    (tmp_path / "qdir" / "quodeq.json").write_text("{}")  # a marker without git is not a clone
    assert not is_shared_clone_run(run)
    (tmp_path / "qdir" / "quodeq.json").unlink()
    _git("init", "-q", cwd=tmp_path / "qdir")  # git without the marker is not a clone either
    assert not is_shared_clone_run(run)


def test_a_run_in_a_marked_git_clone_is_detected(clone_run):
    assert is_shared_clone_run(clone_run)


def test_a_clone_restore_keeps_the_archive_and_never_extracts_the_database(clone_run):
    assert ensure_restored(clone_run)
    assert (clone_run / ARCHIVE_FILENAME).is_file() and is_archived(clone_run)
    assert (clone_run / "events.jsonl").read_text() == _EVENTS
    assert (clone_run / _EVIDENCE).is_file()
    assert unpacked_marker(clone_run).is_file()
    assert not (clone_run / "evaluation.db").exists()
    assert not (clone_run / RESTORED_STAMP).exists()
    assert not (clone_run / ".restore.tmp").exists()


def test_a_second_restore_is_a_no_op_until_the_archive_changes(clone_run, monkeypatch):
    calls = []
    real = run_archive._extract

    def counting(*args, **kwargs):
        calls.append(args)
        return real(*args, **kwargs)

    monkeypatch.setattr(run_archive, "_extract", counting)
    ensure_restored(clone_run)
    assert not ensure_restored(clone_run)
    assert len(calls) == 1
    archive = clone_run / ARCHIVE_FILENAME
    st = archive.stat()
    os.utime(archive, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))  # as a checkout rewriting it would
    assert ensure_restored(clone_run)
    assert len(calls) == 2
    (clone_run / "events.jsonl").unlink()  # an unpacked file gone: unpack again
    assert ensure_restored(clone_run)
    assert len(calls) == 3


def test_opening_an_archived_clone_run_builds_a_local_database(clone_run):
    with open_evaluation_db(clone_run) as conn:
        assert "sentinel_marker" not in {r[0] for r in conn.execute("SELECT name FROM sqlite_master")}
    assert local_db_marker(clone_run).is_file()
    assert (clone_run / "events.jsonl").is_file() and is_archived(clone_run)
    with open_evaluation_db(clone_run) as conn:  # the local database is kept on the next open
        conn.execute("CREATE TABLE IF NOT EXISTS kept (v TEXT)")
        conn.commit()
    with open_evaluation_db(clone_run):
        pass
    assert "kept" in _tables(clone_run / "evaluation.db")


def test_a_foreign_database_in_a_clone_run_is_deleted_and_rebuilt(tmp_path):
    repo = tmp_path / "repo"
    run = _run(repo)
    (repo / "quodeq.json").write_text("{}")
    _git("init", "-q", cwd=repo)
    _sentinel_db(run / "evaluation.db")
    (run / "evaluation.db-wal").write_bytes(b"junk")
    with open_evaluation_db(run) as conn:
        assert "sentinel_marker" not in {r[0] for r in conn.execute("SELECT name FROM sqlite_master")}
    assert local_db_marker(run).is_file()
    assert "sentinel_marker" not in _tables(run / "evaluation.db")


def test_a_local_run_still_opens_its_database_unchanged(tmp_path):
    run = _run(tmp_path / "local")
    _sentinel_db(run / "evaluation.db")
    with open_evaluation_db(run) as conn:
        assert conn.execute("SELECT v FROM sentinel_marker").fetchone() == ("foreign",)
    assert not local_db_marker(run).exists()


def test_write_clone_excludes_merges_idempotently(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _git("init", "-q", cwd=repo)
    exclude = repo / ".git" / "info" / "exclude"
    exclude.write_text("# mine\nbuild/\nevaluation.db\n")
    write_clone_excludes(repo)
    write_clone_excludes(repo)
    lines = exclude.read_text().splitlines()
    assert lines[:2] == ["# mine", "build/"]
    for pattern in CLONE_EXCLUDES:
        assert lines.count(pattern) == 1
    (repo / ".git" / "info").joinpath("exclude").unlink()
    (repo / ".git" / "info").rmdir()
    write_clone_excludes(repo)  # a clone without an info folder gets one
    assert set(CLONE_EXCLUDES) <= set(exclude.read_text().splitlines())


def test_a_tracked_database_loses_its_trust_on_securing(tmp_path):
    repo = tmp_path / "repo"
    run = _run(repo)
    (repo / "quodeq.json").write_text("{}")
    _git("init", "-q", cwd=repo)
    with open_evaluation_db(run):
        pass
    assert local_db_marker(run).is_file()
    _git("add", "-f", "-A", cwd=repo)  # the database is tracked now: a reset may check another one out over it
    secure_clone_tree(repo)
    assert not local_db_marker(run).exists()
