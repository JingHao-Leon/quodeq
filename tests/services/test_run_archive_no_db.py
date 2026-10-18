"""An archive packs the event log and evidence only; a restore rebuilds the database from the event log."""
from __future__ import annotations

import io
import tarfile

from quodeq.data.fs import run_archive
from quodeq.data.fs.run_archive import archive_run, ensure_restored
from quodeq.data.fs.run_archive_files import archive_sources, packed_bytes, report_bytes
from quodeq.data.sqlite.findings_repository import SqliteFindingsRepository
from quodeq.services.scoring import get_scores_raw
from quodeq.services.storage_report import clean_preview
from tests.services._archive_fixtures import NOW, PROJECT, make_run

_DB_FILES = ("evaluation.db", "evaluation.db-wal", "evaluation.db-shm")


def test_a_new_archive_holds_the_event_log_and_evidence_only(tmp_path):
    run = make_run(tmp_path, "r1")
    (run / "evidence").mkdir()
    (run / "evidence" / "security_evidence.jsonl").write_text("{}\n")
    expected = sorted(name for name, _ in archive_sources(run))
    result = archive_run(run)
    with tarfile.open(run / "archive.tar.gz") as tar:
        names = sorted(m.name for m in tar.getmembers())
    assert names == expected == ["events.jsonl", "evidence/security_evidence.jsonl"]
    assert not any((run / n).exists() for n in _DB_FILES)
    assert result.bytes_before > result.bytes_after


def test_a_restore_rebuilds_the_database_from_the_event_log(tmp_path):
    run = make_run(tmp_path, "r1", n=5)
    before = SqliteFindingsRepository(run).list_by_dimension("security")
    archive_run(run)
    assert ensure_restored(run)
    assert (run / "evaluation.db").exists()
    assert len(SqliteFindingsRepository(run).list_by_dimension("security")) == len(before) == 5


def test_the_scalars_of_a_restored_run_match_what_it_had_before(tmp_path):
    run = make_run(tmp_path, "r1", n=5)
    before = get_scores_raw(tmp_path, PROJECT, "r1")
    archive_run(run)
    ensure_restored(run)
    assert get_scores_raw(tmp_path, PROJECT, "r1")["dimensions"] == before["dimensions"]


def test_an_old_archive_with_a_database_restores_as_before(tmp_path, monkeypatch):
    run = make_run(tmp_path, "r1")
    db_bytes = (run / "evaluation.db").read_bytes()
    archive_run(run)
    # Rewrite the archive the old way: the database is a member too.
    with tarfile.open(run / "archive.tar.gz") as tar:
        members = {m.name: tar.extractfile(m).read() for m in tar.getmembers()}
    members["evaluation.db"] = db_bytes
    with tarfile.open(run / "archive.tar.gz", "w:gz") as tar:
        for name, data in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    seen = []
    monkeypatch.setattr(run_archive, "_project_after_restore", lambda rd: seen.append(rd))
    assert ensure_restored(run)
    assert (run / "evaluation.db").read_bytes() == db_bytes
    assert seen == []  # the database came out of the archive, nothing to project


def test_the_preview_counts_the_database_as_freed_in_full(tmp_path):
    make_run(tmp_path, "r1")
    old = make_run(tmp_path, "r2", days=400)
    preview = clean_preview(tmp_path, NOW, 1)
    dropped = sum((old / n).stat().st_size for n in _DB_FILES if (old / n).exists())
    assert preview.archive == 1
    assert preview.frees == int(dropped + 0.76 * packed_bytes(old) + 0.80 * report_bytes(old))
