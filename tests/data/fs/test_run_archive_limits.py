"""Archives from anywhere: capped in size and member count, and they must hold an event log."""
from __future__ import annotations

import io
import tarfile
from pathlib import Path

import pytest

from quodeq.data.fs import run_archive, run_archive_limits
from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, RunArchiveError, ensure_restored

_EVIDENCE = "evidence/security_evidence.jsonl"


def _pack(run: Path, files: dict[str, bytes]) -> Path:
    run.mkdir(parents=True)
    archive = run / ARCHIVE_FILENAME
    with tarfile.open(archive, "w:gz") as tar:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return archive


def _written(run: Path) -> list[str]:
    return sorted(p.name for p in run.iterdir() if p.name != ARCHIVE_FILENAME)


def test_archive_over_the_size_cap_is_refused_before_anything_is_written(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_ARCHIVE_MAX_MB", "1")
    run = tmp_path / "run"
    _pack(run, {"events.jsonl": b"{}\n", _EVIDENCE: b"x" * (2 * 1024 * 1024)})
    with pytest.raises(RunArchiveError, match="larger than"):
        ensure_restored(run)
    assert _written(run) == [".archive.lock"] or _written(run) == []
    assert (run / ARCHIVE_FILENAME).exists()
    assert not (run / "events.jsonl").exists()


def test_archive_with_too_many_members_is_refused(tmp_path):
    run = tmp_path / "run"
    files = {"events.jsonl": b"{}\n"}
    files.update({f"evidence/d{i}_evidence.jsonl": b"" for i in range(run_archive_limits.MAX_MEMBERS)})
    _pack(run, files)
    with pytest.raises(RunArchiveError, match="members"):
        ensure_restored(run)
    assert (run / ARCHIVE_FILENAME).exists()


def test_archive_without_an_event_log_is_refused(tmp_path):
    run = tmp_path / "run"
    _pack(run, {_EVIDENCE: b"{}\n"})
    with pytest.raises(RunArchiveError, match="events.jsonl"):
        ensure_restored(run)
    assert (run / ARCHIVE_FILENAME).exists()
    assert not (run / "evidence").exists()


@pytest.mark.parametrize("value", ["abc", "-5", "0"])
def test_bad_cap_falls_back_to_the_default(monkeypatch, value):
    monkeypatch.setenv("QUODEQ_ARCHIVE_MAX_MB", value)
    assert run_archive_limits.max_archive_bytes() == 2048 * 1024 * 1024


def test_a_normal_archive_still_restores(tmp_path):
    run = tmp_path / "run"
    _pack(run, {"events.jsonl": b"{}\n", _EVIDENCE: b"{}\n"})
    assert ensure_restored(run) is True
    assert (run / "events.jsonl").read_bytes() == b"{}\n"
    assert run_archive.RunArchiveError is run_archive_limits.RunArchiveError
