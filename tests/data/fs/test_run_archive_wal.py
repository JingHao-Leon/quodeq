"""The database log fold on archive and tidy: rows that live only in the WAL are never lost."""
from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

import pytest

from quodeq.data.fs import run_archive_wal
from quodeq.data.fs.run_archive import (
    ARCHIVE_FILENAME,
    RunArchiveError,
    archive_run,
    ensure_restored,
    is_archived,
    tidy_run,
)
from tests.data.fs.test_run_archive import _bytes, _rows, _run_with_files

_EVENTS = "events.jsonl"
_EVIDENCE = "evidence/security_evidence.jsonl"
_KEPT = ("evaluation/security.json", "status.json", "dimensions.json", "evidence/manifest.json")


def _wal_run(tmp_path: Path):
    """A run whose 200 rows live only in the WAL; the open connection keeps the WAL alive."""
    run = _run_with_files(tmp_path)
    conn = sqlite3.connect(run / "evaluation.db")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA wal_autocheckpoint=0")
    conn.executemany("INSERT INTO findings (file) VALUES (?)", [(f"w{i}.py",) for i in range(200)])
    conn.commit()
    assert (run / "evaluation.db-wal").stat().st_size > 0
    return run, conn


def test_rows_only_in_the_wal_survive_archive_and_restore(tmp_path):
    # Build the WAL beside a scratch copy while its writer is open, then copy the database and
    # its WAL into the run: the run holds real WAL-only frames and no open handle (Windows
    # cannot unlink a database a connection still holds).
    run = _run_with_files(tmp_path)
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    shutil.copyfile(run / "evaluation.db", scratch / "evaluation.db")
    conn = sqlite3.connect(scratch / "evaluation.db")
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA wal_autocheckpoint=0")
        conn.executemany("INSERT INTO findings (file) VALUES (?)", [(f"w{i}.py",) for i in range(200)])
        conn.commit()
        expected = conn.execute("SELECT id, file FROM findings ORDER BY id").fetchall()
        for name in ("evaluation.db", "evaluation.db-wal"):
            shutil.copyfile(scratch / name, run / name)
    finally:
        conn.close()
    assert len(expected) == 500
    wal = run / "evaluation.db-wal"
    assert wal.is_file() and wal.stat().st_size > 0
    archive_run(run)
    assert not (run / "evaluation.db").exists()
    assert ensure_restored(run) is True
    assert _rows(run) == expected


def test_a_busy_checkpoint_refuses_the_archive_and_keeps_everything(tmp_path, monkeypatch):
    run, conn = _wal_run(tmp_path)
    reader = sqlite3.connect(run / "evaluation.db")
    reader.execute("BEGIN")
    reader.execute("SELECT count(*) FROM findings").fetchone()
    writer_rows = conn.execute("SELECT count(*) FROM findings").fetchone()[0]
    conn.execute("INSERT INTO findings (file) VALUES ('late.py')")
    conn.commit()
    before = _bytes(run)
    wal_size = (run / "evaluation.db-wal").stat().st_size
    monkeypatch.setattr(run_archive_wal, "_BUSY_TIMEOUT_S", 0.05)
    try:
        with pytest.raises(RunArchiveError):
            archive_run(run)
        assert not is_archived(run) and not (run / ARCHIVE_FILENAME).exists()
        assert _bytes(run) == before and (run / "evaluation.db-wal").stat().st_size >= wal_size
    finally:
        reader.close()
        conn.close()
    assert writer_rows == 500


def test_tidy_folds_the_wal_into_the_database(tmp_path):
    run = tmp_path / "run"
    run.mkdir()
    conn = sqlite3.connect(run / "evaluation.db")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA wal_autocheckpoint=0")
    conn.execute("CREATE TABLE findings (id INTEGER PRIMARY KEY, file TEXT)")
    conn.executemany("INSERT INTO findings (file) VALUES (?)", [(f"f{i}.py",) for i in range(200)])
    conn.commit()
    rows = conn.execute("SELECT id, file FROM findings ORDER BY id").fetchall()
    wal = run / "evaluation.db-wal"
    assert wal.stat().st_size > 0
    assert tidy_run(run) > 0
    assert not wal.exists() or wal.stat().st_size == 0
    assert conn.execute("SELECT id, file FROM findings ORDER BY id").fetchall() == rows
    conn.close()
