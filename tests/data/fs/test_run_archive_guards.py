"""Run archive guards: the restore stamp, and an archive that aborts when a source changes under it."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from quodeq.data.fs import run_archive
from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, RunArchiveError, archive_run, ensure_restored
from quodeq.data.fs.run_archive_guard import RESTORED_STAMP, restored_at

_EVENTS = "events.jsonl"
_EVIDENCE = "evidence/security_evidence.jsonl"


def _run(tmp_path: Path) -> Path:
    run = tmp_path / "proj" / "run-1"
    (run / "evidence").mkdir(parents=True)
    (run / _EVENTS).write_text('{"type": "finding"}\n' * 50)
    (run / _EVIDENCE).write_text('{"snippet": "x"}\n' * 50)
    (run / "evaluation.db").write_bytes(b"db" * 100)
    (run / "status.json").write_text('{"state": "done"}')
    return run


def _mutate_after_verify(monkeypatch, mutate) -> None:
    """Run *mutate* right after the archive is verified, before the originals go."""
    real = run_archive._verify_archive

    def verify_then_mutate(tmp, sources):
        real(tmp, sources)
        mutate()

    monkeypatch.setattr(run_archive, "_verify_archive", verify_then_mutate)


def test_a_restore_stamps_the_run_and_an_archive_removes_the_stamp(tmp_path):
    run = _run(tmp_path)
    archive_run(run)
    assert restored_at(run) is None
    before = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert ensure_restored(run) is True
    stamped = restored_at(run)
    assert stamped is not None and stamped >= before
    archive_run(run)
    assert not (run / RESTORED_STAMP).exists() and restored_at(run) is None


def test_an_unreadable_stamp_falls_back_to_its_file_time(tmp_path):
    run = _run(tmp_path)
    (run / RESTORED_STAMP).write_text("not a time")
    assert restored_at(run) is not None


def test_a_source_written_during_the_archive_aborts_it(tmp_path, monkeypatch):
    run = _run(tmp_path)
    _mutate_after_verify(monkeypatch, lambda: (run / _EVENTS).open("a").write('{"late": 1}\n'))
    with pytest.raises(RunArchiveError):
        archive_run(run)
    assert not (run / ARCHIVE_FILENAME).exists()
    assert (run / _EVENTS).read_text().endswith('{"late": 1}\n')
    assert (run / _EVIDENCE).is_file() and (run / "evaluation.db").is_file()


def test_a_database_opened_during_the_archive_aborts_it(tmp_path, monkeypatch):
    run = _run(tmp_path)
    _mutate_after_verify(monkeypatch, lambda: (run / "evaluation.db-wal").write_bytes(b""))
    with pytest.raises(RunArchiveError):
        archive_run(run)
    assert not (run / ARCHIVE_FILENAME).exists()
    assert all((run / n).is_file() for n in (_EVENTS, _EVIDENCE, "evaluation.db", "evaluation.db-wal"))
