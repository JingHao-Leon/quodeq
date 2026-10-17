"""Archive minors fixed before cleanup is on by default: races, repeated warnings, tidy's VACUUM."""
from __future__ import annotations

import logging
import sqlite3

import pytest

from quodeq.data.fs import run_archive, run_archive_wal
from quodeq.data.fs.run_archive import (
    ARCHIVE_FILENAME, RunArchiveError, archive_run, is_archived, restore_or_warn, tidy_run,
)
from quodeq.data.projection import projector as projector_mod
from quodeq.data.sqlite import connection as connection_mod
from quodeq.data.sqlite.connection import open_evaluation_db
from tests.api._scores_routes_helpers import _scorable_violations, _seed_run
from tests.data.fs.test_run_archive import _run_with_files

_EVIDENCE = "evidence/security_evidence.jsonl"


def test_a_corrupt_archive_warns_once_per_run(tmp_path, caplog):
    run = _run_with_files(tmp_path)
    archive_run(run)
    (run / ARCHIVE_FILENAME).write_bytes(b"not a tarball")

    with caplog.at_level(logging.WARNING, logger="quodeq.data.fs"):
        assert [restore_or_warn(run) for _ in range(3)] == [False, False, False]

    assert len([r for r in caplog.records if str(run) in r.getMessage()]) == 1


def test_a_lock_timeout_warns_once_per_run(tmp_path, monkeypatch, caplog):
    run = _run_with_files(tmp_path)
    archive_run(run)

    def stuck(_run_dir):
        raise TimeoutError("lock wait")

    monkeypatch.setattr(run_archive, "ensure_restored", stuck)
    with caplog.at_level(logging.WARNING, logger="quodeq.data.fs"):
        assert not restore_or_warn(run) and not restore_or_warn(run)

    assert len([r for r in caplog.records if "lock wait" in r.getMessage()]) == 1


def _with_free_pages(run):
    conn = sqlite3.connect(run / "evaluation.db")
    conn.execute("CREATE TABLE bulk (blob TEXT)")
    conn.executemany("INSERT INTO bulk VALUES (?)", [("x" * 4000,) for _ in range(500)])
    conn.commit()
    conn.execute("DELETE FROM bulk")
    conn.commit()
    conn.close()


def test_tidy_vacuums_the_database_and_counts_the_gain(tmp_path):
    run = _run_with_files(tmp_path)
    _with_free_pages(run)
    before = (run / "evaluation.db").stat().st_size

    freed = tidy_run(run)

    after = (run / "evaluation.db").stat().st_size
    assert after < before - 1_000_000
    assert freed >= before - after
    assert sqlite3.connect(run / "evaluation.db").execute("SELECT COUNT(*) FROM findings").fetchone() == (300,)


def test_a_failed_vacuum_is_logged_and_tidy_carries_on(tmp_path, caplog):
    run = _run_with_files(tmp_path)
    (run / "evaluation.db").write_bytes(b"not a database" * 100)
    (run / "evidence" / "security_queue.json").write_text("[]")

    with caplog.at_level(logging.WARNING, logger="quodeq.data.fs"):
        freed = tidy_run(run)

    assert freed == 2 and not (run / "evidence" / "security_queue.json").exists()
    assert "vacuum" in caplog.text.lower()


def _projected_run(tmp_path):
    return _seed_run(tmp_path, "proj", "run-1", _scorable_violations(5, dimension="security"))


def test_a_run_archived_right_after_its_restore_check_is_restored_again(tmp_path, monkeypatch):
    run = _projected_run(tmp_path)
    real = run_archive.ensure_restored
    calls = []

    def restore_then_archive(run_dir):
        restored = real(run_dir)
        if not calls:
            archive_run(run_dir)  # archived between the restore and the log check
        calls.append(run_dir)
        return restored

    monkeypatch.setattr(run_archive, "ensure_restored", restore_then_archive)
    projector_mod.Projector().ensure_projected(run / "events.jsonl", run, project_dir=run.parent)

    assert (run / "events.jsonl").is_file() and not is_archived(run)


def test_opening_a_database_while_its_run_is_archived_leaves_no_empty_db(tmp_path, monkeypatch):
    run = _projected_run(tmp_path)
    real = connection_mod._connect
    calls = []

    def archive_then_connect(path):
        if not calls:
            archive_run(run)  # archived between the restore and the connect
        calls.append(path)
        return real(path)

    monkeypatch.setattr(connection_mod, "_connect", archive_then_connect)
    with open_evaluation_db(run) as conn:
        rows = conn.execute("SELECT COUNT(*) FROM findings").fetchone()[0]

    assert rows == 5
    assert not (is_archived(run) and (run / "evaluation.db").exists())


def test_an_evidence_file_created_mid_pack_aborts_the_archive(tmp_path, monkeypatch):
    run = _run_with_files(tmp_path)
    real = run_archive._write_archive
    late = run / "evidence" / "quality_evidence.jsonl"

    def write_then_add(tmp, sources):
        real(tmp, sources)
        late.write_text('{"late": true}\n')

    monkeypatch.setattr(run_archive, "_write_archive", write_then_add)
    with pytest.raises(RunArchiveError):
        archive_run(run)

    assert not is_archived(run) and not (run / (ARCHIVE_FILENAME + ".tmp")).exists()
    assert late.is_file() and (run / _EVIDENCE).is_file() and (run / "events.jsonl").is_file()
    assert (run / "evaluation.db").is_file()


def test_a_stale_archived_check_never_deletes_the_restored_database(tmp_path, monkeypatch):
    run = _projected_run(tmp_path)
    real_connect, real_archived = connection_mod._connect, connection_mod.is_archived
    seen = []

    def archive_connect_restore(path):
        if not seen:
            archive_run(run)  # the archive takes the real database
        conn = real_connect(path)  # a stray, created beside the archive
        if not seen:
            run_archive.ensure_restored(run)  # another reader restores the real one over it
        seen.append(path)
        return conn

    stale = [True]

    def stale_archived(run_dir):  # this reader saw the archive before that restore removed it
        if seen and stale:
            stale.pop()
            return True
        return real_archived(run_dir)

    monkeypatch.setattr(connection_mod, "_connect", archive_connect_restore)
    monkeypatch.setattr(connection_mod, "is_archived", stale_archived)
    with open_evaluation_db(run) as conn:
        rows = conn.execute("SELECT COUNT(*) FROM findings").fetchone()[0]

    assert rows == 5
    assert sqlite3.connect(run / "evaluation.db").execute("SELECT COUNT(*) FROM findings").fetchone() == (5,)


def test_vacuum_is_skipped_while_a_reader_holds_the_log(tmp_path, monkeypatch):
    run = _run_with_files(tmp_path)
    _with_free_pages(run)
    writer = sqlite3.connect(run / "evaluation.db")
    writer.execute("PRAGMA journal_mode=WAL")
    writer.execute("INSERT INTO findings (file) VALUES ('w.py')")
    writer.commit()
    reader = sqlite3.connect(run / "evaluation.db")
    reader.execute("BEGIN")
    reader.execute("SELECT COUNT(*) FROM findings").fetchone()  # pins the log
    vacuumed = []
    real_execute = sqlite3.Connection.execute

    monkeypatch.setattr(run_archive_wal.sqlite3, "connect", lambda *a, **k: _Spy(real_execute, vacuumed, *a, **k))
    try:
        assert run_archive_wal.vacuum_db(run) == 0
    finally:
        reader.close()
        writer.close()
    assert "VACUUM" not in vacuumed


class _Spy:
    """A sqlite3 connection that records the statements it runs."""

    def __init__(self, real_execute, seen, *args, **kwargs):
        self._conn = sqlite3.Connection(*args, **kwargs)
        self._real, self._seen = real_execute, seen

    def execute(self, sql, *params):
        self._seen.append(sql)
        return self._real(self._conn, sql, *params)

    def close(self):
        self._conn.close()
