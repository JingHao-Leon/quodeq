"""Archive minors fixed before cleanup is on by default: races, repeated warnings, tidy's VACUUM."""
from __future__ import annotations

import logging
import sqlite3

import pytest

from quodeq.data.fs import run_archive
from quodeq.data.fs.run_archive import (
    ARCHIVE_FILENAME, RunArchiveError, archive_run, is_archived, restore_or_warn, tidy_run,
)
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
