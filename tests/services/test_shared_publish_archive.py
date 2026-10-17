"""copy_run keeps a run's published form and never restores the local archive."""
from __future__ import annotations

import tarfile
from pathlib import Path

import pytest

from quodeq.data.fs import run_archive
from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, RESTORED_STAMP, archive_run, ensure_restored, is_archived
from quodeq.services.shared_publish import copy_run
from tests.services._archive_fixtures import corrupt, make_run

_EVIDENCE = "evidence/security_evidence.jsonl"


def _run(root: Path, run_id: str = "run-old") -> Path:
    run = make_run(root, run_id)
    (run / "evidence").mkdir(exist_ok=True)
    (run / "evidence" / "manifest.json").write_text("{}")
    (run / _EVIDENCE).write_text('{"snippet": "x"}\n')
    return run


def _members(archive: Path) -> list[str]:
    with tarfile.open(archive, "r:gz") as tar:
        return tar.getnames()


def _local_state(run: Path) -> tuple:
    archive = run / ARCHIVE_FILENAME
    return is_archived(run), archive.read_bytes(), archive.stat().st_mtime_ns, sorted(p.name for p in run.iterdir())


def test_an_archived_run_new_to_the_repo_is_published_in_archive_form(tmp_path):
    run = _run(tmp_path / "local")
    archive_run(run)
    dest = tmp_path / "clone" / "run-old"
    written = copy_run(run, dest)
    assert _members(dest / ARCHIVE_FILENAME) == ["events.jsonl", _EVIDENCE]
    assert (dest / "scalars.json").is_file() and (dest / "precedents.json").is_file()
    assert not (dest / "events.jsonl").exists() and not (dest / _EVIDENCE).exists()
    assert {p.relative_to(dest).as_posix() for p in written} >= {
        ARCHIVE_FILENAME, "scalars.json", "precedents.json", "status.json", "evidence/manifest.json",
        "evaluation/security.json",
    }


def test_publishing_leaves_the_local_archive_alone(tmp_path):
    run = _run(tmp_path / "local")
    archive_run(run)
    before = _local_state(run)
    copy_run(run, tmp_path / "clone" / "run-old")
    assert _local_state(run) == before
    assert not (run / RESTORED_STAMP).exists() and not (run / "events.jsonl").exists()


def test_a_run_published_in_full_form_stays_full_form_once_archived_locally(tmp_path):
    run = _run(tmp_path / "local")
    dest = tmp_path / "clone" / "run-old"
    copy_run(run, dest)
    published = {name: (dest / name).read_bytes() for name in ("events.jsonl", _EVIDENCE)}
    archive_run(run)
    written = copy_run(run, dest)
    assert {name: (dest / name).read_bytes() for name in published} == published
    assert not (dest / ARCHIVE_FILENAME).exists() and not (dest / "scalars.json").exists()
    assert dest / "events.jsonl" in written
    assert is_archived(run)


def test_a_live_run_new_to_the_repo_is_published_in_full_form(tmp_path):
    run = _run(tmp_path / "local")
    dest = tmp_path / "clone" / "run-old"
    copy_run(run, dest)
    assert (dest / "events.jsonl").read_bytes() == (run / "events.jsonl").read_bytes()
    assert not (dest / ARCHIVE_FILENAME).exists() and not (dest / "evaluation.db").exists()


def test_republishing_an_archive_form_run_writes_the_same_bytes(tmp_path):
    run = _run(tmp_path / "local")
    archive_run(run)
    first, second = tmp_path / "a" / "run-old", tmp_path / "b" / "run-old"
    copy_run(run, first)
    copy_run(run, second)
    assert (first / ARCHIVE_FILENAME).read_bytes() == (second / ARCHIVE_FILENAME).read_bytes()


def test_a_run_restored_locally_keeps_its_archive_form_with_the_same_bytes(tmp_path):
    run = _run(tmp_path / "local")
    archive_run(run)
    dest = tmp_path / "clone" / "run-old"
    copy_run(run, dest)
    packed = (dest / ARCHIVE_FILENAME).read_bytes()
    ensure_restored(run)
    copy_run(run, dest)
    assert (dest / ARCHIVE_FILENAME).read_bytes() == packed
    assert not (dest / "events.jsonl").exists()


def test_a_corrupt_local_archive_fails_and_stays_as_it_was(tmp_path):
    run = _run(tmp_path / "local")
    corrupt(run)
    before = (run / ARCHIVE_FILENAME).read_bytes()
    dest = tmp_path / "clone" / "run-old"
    with pytest.raises(run_archive.RunArchiveError):
        copy_run(run, dest)
    assert (run / ARCHIVE_FILENAME).read_bytes() == before
    assert not (dest / "status.json").exists() and not (dest / ARCHIVE_FILENAME).exists()


def test_a_corrupt_archive_never_reaches_a_full_form_destination(tmp_path):
    run = _run(tmp_path / "local")
    dest = tmp_path / "clone" / "run-old"
    copy_run(run, dest)
    events = (dest / "events.jsonl").read_bytes()
    corrupt(run)
    with pytest.raises(run_archive.RunArchiveError):
        copy_run(run, dest)
    assert (dest / "events.jsonl").read_bytes() == events
