"""Archive guards: a run a restore would refuse is never packed, and a file that cannot be deleted undoes the archive."""
from __future__ import annotations

from pathlib import Path

import pytest

from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, RunArchiveError, archive_run, ensure_restored, is_archived
from quodeq.data.fs.run_precedents import PRECEDENTS_NAME
from quodeq.data.fs.run_scalars import SCALARS_NAME
from quodeq.services.storage_plan import plan_cleanup
from tests.data.fs.test_run_archive import _EVIDENCE, _bytes, _run_with_files
from tests.services._storage_fixtures import NOW, make_run

_MB = 1024 * 1024


def test_a_run_bigger_than_a_restore_accepts_is_left_unpacked(tmp_path, monkeypatch):
    run = _run_with_files(tmp_path)
    (run / "events.jsonl").write_bytes(b"x" * (2 * _MB))
    before = _bytes(run)
    monkeypatch.setenv("QUODEQ_ARCHIVE_MAX_MB", "1")

    with pytest.raises(RunArchiveError, match="restore allows"):
        archive_run(run)

    assert not is_archived(run) and _bytes(run) == before
    assert not (run / SCALARS_NAME).exists()


def test_the_plan_never_archives_a_run_past_the_restore_cap(tmp_path, monkeypatch):
    big = make_run(tmp_path, "p", "big", 400)
    small = make_run(tmp_path, "p", "small", 300)
    make_run(tmp_path, "p", "newest", 10)
    (big / "events.jsonl").write_bytes(b"x" * (2 * _MB))
    monkeypatch.setenv("QUODEQ_ARCHIVE_MAX_MB", "1")

    plan = plan_cleanup(tmp_path, NOW, 1)

    assert plan.archive == (small,)
    assert big in plan.tidy


def _hold(monkeypatch, held: Path) -> None:
    """Make deleting *held* fail as Windows does while another process has the file open."""
    real = Path.unlink

    def unlink(self, missing_ok=False):
        if self == held:
            raise PermissionError(32, "The process cannot access the file because it is being used")
        return real(self, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", unlink)


def test_an_original_that_cannot_be_deleted_undoes_the_archive(tmp_path, monkeypatch):
    run = _run_with_files(tmp_path)
    before = _bytes(run)
    _hold(monkeypatch, run / _EVIDENCE)  # events.jsonl goes first, then this one is held, before the database

    with pytest.raises(RunArchiveError, match="left it unpacked"):
        archive_run(run)

    assert not is_archived(run) and not (run / ARCHIVE_FILENAME).exists()
    assert _bytes(run) == before
    assert not (run / SCALARS_NAME).exists() and not (run / PRECEDENTS_NAME).exists()
    assert not (run / ".restore.tmp").exists()


def test_the_next_pass_archives_a_run_once_the_file_is_released(tmp_path, monkeypatch):
    run = _run_with_files(tmp_path)
    before = _bytes(run)
    _hold(monkeypatch, run / _EVIDENCE)
    with pytest.raises(RunArchiveError):
        archive_run(run)
    monkeypatch.undo()

    archive_run(run)

    assert is_archived(run) and not (run / _EVIDENCE).exists()
    assert ensure_restored(run)
    rebuilt = ("evaluation.db", PRECEDENTS_NAME, SCALARS_NAME)  # the database comes back from the event log
    assert {k: v for k, v in _bytes(run).items() if k not in rebuilt} == {k: v for k, v in before.items() if k not in rebuilt}
