"""A hostile shared repository: committed markers, symlinks and packed databases are never trusted."""
from __future__ import annotations

import os
import sqlite3
import subprocess
import tarfile
from pathlib import Path

import pytest

from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, RunArchiveError, archive_run, ensure_restored
from quodeq.data.fs.shared_clone_runs import local_db_marker, unpacked_marker
from quodeq.data.sqlite.connection import open_evaluation_db
from quodeq.data.sqlite.errors import SqliteStoreUnreadableError

_EVENTS = '{"type": "finding"}\n' * 20


def _git(*args: str, cwd: Path) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def _sentinel_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE sentinel_marker (v TEXT)")
    conn.commit()
    conn.close()


def _has_sentinel(path: Path) -> bool:
    conn = sqlite3.connect(path)
    try:
        return conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'sentinel_marker'").fetchone() is not None
    finally:
        conn.close()


def _commit_all(repo: Path) -> None:
    _git("add", "-f", "-A", cwd=repo)
    _git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c", cwd=repo)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "quodeq.json").write_text("{}")
    _git("init", "-q", cwd=repo)
    return repo


def _run(repo: Path, *, archived: bool) -> Path:
    run = repo / "evaluations" / "proj" / "run-1"
    run.mkdir(parents=True)
    (run / "events.jsonl").write_text(_EVENTS)
    (run / "evidence").mkdir()
    (run / "evidence" / "security_evidence.jsonl").write_text('{"p": 1}\n')
    _sentinel_db(run / "evaluation.db")
    if archived:
        archive_run(run)
        (run / ".archive.lock").unlink()
    return run


def test_committed_markers_in_the_run_folder_change_nothing(repo):
    run = _run(repo, archived=True)
    (run / ".local_db").write_text("")
    (run / ".unpacked").write_text('{"size": 1, "mtime_ns": 1, "members": ["events.jsonl"]}')
    _sentinel_db(run / "evaluation.db")  # a committed database beside the archive
    _commit_all(repo)
    with open_evaluation_db(run) as conn:
        assert not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'sentinel_marker'").fetchone()
    assert (run / "events.jsonl").read_text() == _EVENTS  # extracted despite the committed .unpacked
    assert unpacked_marker(run).is_file() and local_db_marker(run).is_file()
    assert repo / ".git" in unpacked_marker(run).parents


def test_markers_survive_a_hard_reset_and_a_rewritten_archive_unpacks_again(repo, monkeypatch):
    run = _run(repo, archived=True)
    _commit_all(repo)
    with open_evaluation_db(run):
        pass
    _git("reset", "-q", "--hard", "HEAD", cwd=repo)
    assert unpacked_marker(run).is_file() and local_db_marker(run).is_file()
    assert not ensure_restored(run)  # the archive was not rewritten: still unpacked
    archive = run / ARCHIVE_FILENAME
    archive.unlink()
    _git("checkout", "--", f"evaluations/proj/run-1/{ARCHIVE_FILENAME}", cwd=repo)  # a new mtime
    assert ensure_restored(run)


def test_a_reset_checking_a_tracked_database_out_is_not_trusted(repo):
    run = _run(repo, archived=False)
    _commit_all(repo)  # evaluation.db with the sentinel is tracked
    with open_evaluation_db(run):
        pass
    assert not _has_sentinel(run / "evaluation.db")
    _git("checkout", "--", "evaluations/proj/run-1/evaluation.db", cwd=repo)  # no securing pass after it
    assert _has_sentinel(run / "evaluation.db")
    with open_evaluation_db(run) as conn:
        assert not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'sentinel_marker'").fetchone()


def test_a_symlinked_evidence_folder_refuses_the_restore(repo, tmp_path):
    run = _run(repo, archived=True)
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    (run / "evidence").rmdir()  # emptied by the archive
    os.symlink(elsewhere, run / "evidence")
    _commit_all(repo)
    with pytest.raises(RunArchiveError):
        ensure_restored(run)
    with pytest.raises(SqliteStoreUnreadableError):
        with open_evaluation_db(run):
            pass
    assert list(elsewhere.iterdir()) == []
    assert not (run / "events.jsonl").exists()


def test_a_symlinked_run_folder_never_loses_the_target_database(repo, tmp_path):
    target = tmp_path / "local" / "proj" / "run-9"
    target.mkdir(parents=True)
    _sentinel_db(target / "evaluation.db")
    (repo / "evaluations" / "proj").mkdir(parents=True)
    os.symlink(target, repo / "evaluations" / "proj" / "run-1")
    run = repo / "evaluations" / "proj" / "run-1"
    with pytest.raises(SqliteStoreUnreadableError):
        with open_evaluation_db(run):
            pass
    assert _has_sentinel(target / "evaluation.db")


def test_the_packed_database_is_never_handed_to_extractall(repo, monkeypatch):
    run = _run(repo, archived=True)
    seen: list[str] = []
    real = tarfile.TarFile.extractall

    def spy(self, path=".", members=None, **kwargs):
        seen.extend(m.name for m in members)
        return real(self, path, members=members, **kwargs)

    monkeypatch.setattr(tarfile.TarFile, "extractall", spy)
    assert ensure_restored(run)
    assert "events.jsonl" in seen and "evaluation.db" not in seen


def test_a_reused_inode_without_the_local_token_is_rebuilt(repo, monkeypatch):
    from quodeq.data.fs import shared_clone_runs

    run = _run(repo, archived=False)
    _commit_all(repo)
    with open_evaluation_db(run):
        pass
    record = shared_clone_runs._read_marker(local_db_marker(run))
    assert record and record.get("token")
    for name in ("evaluation.db", "evaluation.db-wal", "evaluation.db-shm"):
        (run / name).unlink(missing_ok=True)
    _sentinel_db(run / "evaluation.db")  # a different file, without the token
    same = {"dev": record["dev"], "ino": record["ino"]}
    monkeypatch.setattr(shared_clone_runs, "_db_identity", lambda _run_dir: dict(same))  # the inode came back
    with open_evaluation_db(run) as conn:
        assert not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'sentinel_marker'").fetchone()
    assert not _has_sentinel(run / "evaluation.db")


def test_a_legit_reopen_keeps_the_database(repo, monkeypatch):
    from quodeq.data.fs import shared_clone_runs

    run = _run(repo, archived=False)
    _commit_all(repo)
    with open_evaluation_db(run) as conn:
        conn.execute("CREATE TABLE kept (v TEXT)")
        conn.execute("INSERT INTO kept VALUES ('x')")
        conn.commit()
    forgets: list[Path] = []
    real_forget = shared_clone_runs._forget_db
    monkeypatch.setattr(shared_clone_runs, "_forget_db", lambda d: (forgets.append(d), real_forget(d)))
    monkeypatch.setattr(shared_clone_runs, "new_token", lambda: pytest.fail("a trusted database got a new token"))
    for _ in range(2):
        with open_evaluation_db(run) as conn:
            assert conn.execute("SELECT v FROM kept").fetchone() == ("x",)
    assert forgets == []
