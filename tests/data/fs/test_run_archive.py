"""Run archive: pack a finished run's event log and evidence, restore it exactly."""
from __future__ import annotations

import io
import sqlite3
import tarfile
import threading
from pathlib import Path

import pytest

from quodeq.data.fs import run_archive
from quodeq.data.fs.run_archive import (
    ARCHIVE_FILENAME,
    RunArchiveError,
    archive_run,
    ensure_restored,
    has_event_log,
    is_archived,
    tidy_run,
)

_EVENTS = "events.jsonl"
_EVIDENCE = "evidence/security_evidence.jsonl"
_KEPT = ("evaluation/security.json", "status.json", "dimensions.json", "evidence/manifest.json")


def _run_with_files(tmp_path: Path) -> Path:
    run = tmp_path / "proj" / "run-1"
    files = {
        _EVENTS: '{"type": "finding", "file": "a.py"}\n' * 400,
        _EVIDENCE: '{"principle": "P1", "snippet": "x = 1"}\n' * 400,
        "evidence/manifest.json": '{"files": 3}',
        "evaluation.db": "x" * 4096,
        "evaluation.db-wal": "w" * 1024,
        "evaluation/security.json": '{"grade": "B"}',
        "status.json": '{"status": "completed"}',
        "dimensions.json": '["security"]',
    }
    for name, text in files.items():
        path = run / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return run


def _bytes(run: Path) -> dict[str, bytes]:
    """File bytes by name; the WAL sidecar is left out because opening the database may fold it."""
    return {
        p.relative_to(run).as_posix(): p.read_bytes()
        for p in run.rglob("*") if p.is_file() and not p.name.startswith(".") and p.name != "evaluation.db-wal"
    }


def _originals_present(run: Path) -> bool:
    return all((run / n).is_file() for n in (_EVENTS, _EVIDENCE, "evaluation.db"))


def test_round_trip_restores_identical_bytes(tmp_path):
    run = _run_with_files(tmp_path)
    before = _bytes(run)
    result = archive_run(run)
    assert is_archived(run) and has_event_log(run)
    assert not (run / _EVENTS).exists() and not (run / "evaluation.db").exists()
    assert not (run / "evaluation.db-wal").exists()
    assert all((run / name).exists() for name in _KEPT)
    assert result.bytes_after < result.bytes_before
    assert ensure_restored(run) is True and not is_archived(run)
    restored = _bytes(run)
    for name in (_EVENTS, _EVIDENCE, "evaluation.db", *_KEPT):
        assert restored[name] == before[name]
    assert not (run / "evaluation.db-wal").exists()


def test_restoring_a_live_run_is_a_no_op(tmp_path):
    run = _run_with_files(tmp_path)
    before = _bytes(run)
    assert ensure_restored(run) is False
    assert _bytes(run) == before


def test_a_run_without_an_event_log_cannot_be_archived(tmp_path):
    run = _run_with_files(tmp_path)
    (run / _EVENTS).unlink()
    assert not has_event_log(run)
    with pytest.raises(RunArchiveError):
        archive_run(run)
    assert (run / _EVIDENCE).is_file() and not is_archived(run)


def test_an_archived_run_cannot_be_archived_again(tmp_path):
    run = _run_with_files(tmp_path)
    archive_run(run)
    with pytest.raises(RunArchiveError):
        archive_run(run)
    assert is_archived(run)


def test_interrupted_archive_leaves_the_run_intact(tmp_path, monkeypatch):
    run = _run_with_files(tmp_path)
    before = _bytes(run)

    def _crash(*_args, **_kwargs):
        raise RuntimeError("app quit during verify")

    monkeypatch.setattr(run_archive, "_verify_archive", _crash)
    with pytest.raises(RuntimeError):
        archive_run(run)
    assert _bytes(run) == before
    assert not is_archived(run)
    assert not list(run.glob("*.tmp"))


def test_leftover_temp_files_are_cleaned_on_the_next_attempt(tmp_path):
    run = _run_with_files(tmp_path)
    (run / (ARCHIVE_FILENAME + ".tmp")).write_bytes(b"half written")
    (run / ".restore.tmp").mkdir()
    (run / ".restore.tmp" / _EVENTS).write_text("stale")
    archive_run(run)
    assert not list(run.glob("*.tmp")) and not list(run.glob(".*.tmp"))
    assert ensure_restored(run) is True
    assert not (run / ".restore.tmp").exists()


def test_write_failure_keeps_the_originals(tmp_path, monkeypatch):
    run = _run_with_files(tmp_path)
    before = _bytes(run)

    def _disk_full(*_args, **_kwargs):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(tarfile.TarFile, "add", _disk_full)
    with pytest.raises(OSError):
        archive_run(run)
    assert _bytes(run) == before and _originals_present(run)
    assert not is_archived(run)
    assert not list(run.glob("*.tmp"))


def test_concurrent_restores_restore_once(tmp_path):
    run = _run_with_files(tmp_path)
    archive_run(run)
    results: list[bool] = []
    seen: list[bool] = []
    barrier = threading.Barrier(8)

    def _read():
        barrier.wait()
        results.append(ensure_restored(run))
        seen.append((run / _EVENTS).is_file())

    threads = [threading.Thread(target=_read) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results) == [False] * 7 + [True]
    assert all(seen) and not is_archived(run)


def _add(tar: tarfile.TarFile, name: str, data: bytes = b"evil") -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))


def _hostile_archive(run: Path, members: list[str], symlink: bool = False) -> None:
    with tarfile.open(run / ARCHIVE_FILENAME, "w:gz") as tar:
        _add(tar, _EVENTS, b"{}\n")
        for name in members:
            _add(tar, name)
        if symlink:
            link = tarfile.TarInfo("evidence/link_evidence.jsonl")
            link.type = tarfile.SYMTYPE
            link.linkname = "/etc/passwd"
            tar.addfile(link)


@pytest.mark.parametrize(
    ("members", "symlink"),
    [
        (["../escape.txt"], False),
        (["/abs.txt"], False),
        ([], True),
        (["evidence/../../escape.txt"], False),
        (["status.json"], False),
    ],
)
def test_unsafe_archive_is_refused(tmp_path, members, symlink):
    run = tmp_path / "proj" / "run-1"
    run.mkdir(parents=True)
    _hostile_archive(run, members, symlink)
    with pytest.raises(RunArchiveError):
        ensure_restored(run)
    outside = [p for p in tmp_path.rglob("*") if run not in p.parents and p != run]
    assert outside == [run.parent]
    assert is_archived(run)
    assert not (run / _EVENTS).exists() and not (run / ".restore.tmp").exists()


def test_corrupt_archive_is_refused(tmp_path):
    run = tmp_path / "run"
    run.mkdir()
    (run / ARCHIVE_FILENAME).write_bytes(b"\x1f\x8b not really gzip")
    with pytest.raises(RunArchiveError):
        ensure_restored(run)
    assert is_archived(run) and not (run / ".restore.tmp").exists()


def test_tidy_removes_only_scratch_sidecars(tmp_path):
    run = _run_with_files(tmp_path)
    (run / "evaluation.db").unlink()
    (run / "evaluation.db-wal").unlink()
    scratch = {"security_queue.json": "q" * 100, "security_dispatch_keys.json": "k" * 50,
               "security_replayed_unconsolidated_keys.json": "r" * 25}
    for name, text in scratch.items():
        (run / "evidence" / name).write_text(text)
    assert tidy_run(run) == 175
    assert not any((run / "evidence" / name).exists() for name in scratch)
    assert (run / _EVIDENCE).is_file() and (run / "evidence" / "manifest.json").is_file()


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
