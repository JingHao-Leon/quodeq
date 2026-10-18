"""The archive packs a run's reports in place with their mtime, a restore unpacks them, old archives stay readable."""
from __future__ import annotations

import gzip
import os
from pathlib import Path

import pytest

from quodeq.data.fs import run_archive_reports
from quodeq.data.fs.report_parser.finding_details import read_eval_report
from quodeq.data.fs.run_archive import RunArchiveError, archive_run, ensure_restored, is_archived
from quodeq.data.fs.run_archive_reports import pack_reports_in_place
from quodeq.data.projection.grade_projector import report_stamp
from tests.data.fs._report_fixtures import write_report
from tests.services._archive_fixtures import make_run


def _plain(run: Path) -> Path:
    return run / "evaluation" / "security.json"


def _packed(run: Path) -> Path:
    return run / "evaluation" / "security.json.gz"


def test_archiving_packs_the_reports_with_their_mtime(tmp_path):
    run = make_run(tmp_path, "r1")
    stamp = _plain(run).stat().st_mtime_ns
    result = archive_run(run)
    assert _packed(run).is_file() and not _plain(run).exists()
    assert _packed(run).stat().st_mtime_ns == stamp
    assert result.bytes_before > result.bytes_after
    assert read_eval_report(run / "evaluation", "security")["dimension"] == "security"


def test_restoring_unpacks_the_reports_with_their_mtime(tmp_path):
    run = make_run(tmp_path, "r1")
    stamp, text = _plain(run).stat().st_mtime_ns, _plain(run).read_text()
    archive_run(run)
    assert ensure_restored(run)
    assert _plain(run).read_text() == text and _plain(run).stat().st_mtime_ns == stamp
    assert not _packed(run).exists()


def test_a_restored_run_does_not_rederive_its_grades(tmp_path):
    run = make_run(tmp_path, "r1")
    before = report_stamp(run)
    archive_run(run)
    packed_stamp = report_stamp(run)
    ensure_restored(run)
    assert before != "0" and packed_stamp == before and report_stamp(run) == before


def test_an_interrupted_pack_leaves_a_readable_archived_run(tmp_path, monkeypatch):
    run = make_run(tmp_path, "r1")
    write_report(run / "evaluation", "quality", {"dimension": "quality", "violations": []})
    real = os.replace

    def fail_second(src, dst):
        if str(dst).endswith("security.json.gz"):
            raise OSError("disk full")
        return real(src, dst)

    monkeypatch.setattr(run_archive_reports.os, "replace", fail_second)
    with pytest.raises(RunArchiveError):
        archive_run(run)
    assert is_archived(run)
    assert read_eval_report(run / "evaluation", "security")["dimension"] == "security"  # still plain
    assert read_eval_report(run / "evaluation", "quality")["dimension"] == "quality"  # packed
    assert not list((run / "evaluation").glob("*.tmp"))


def test_an_old_archive_with_plain_reports_restores_as_before(tmp_path):
    run = make_run(tmp_path, "r1")
    archive_run(run)
    # Undo the packing by hand: the shape step 1 left behind.
    data = gzip.decompress(_packed(run).read_bytes())
    _plain(run).write_bytes(data)
    _packed(run).unlink()
    assert ensure_restored(run)
    assert _plain(run).read_bytes() == data and not _packed(run).exists()


def test_pack_reports_in_place_counts_bytes_and_skips_a_run_without_plain_reports(tmp_path):
    run = make_run(tmp_path, "r1")
    plain_size = _plain(run).stat().st_size
    before, after = pack_reports_in_place(run)
    assert before == plain_size and 0 < after < before
    assert pack_reports_in_place(run) == (0, 0)
