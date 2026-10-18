"""The cleanup pass packs the reports of runs archived before this change, and the preview counts the saving."""
from __future__ import annotations

import gzip

from quodeq.core.observability import NULL_LOG
from quodeq.data.fs.run_archive import is_archived
from quodeq.services.storage_cleanup import archive_keeping_keys, run_cleanup
from quodeq.services.storage_plan import plan_cleanup
from quodeq.data.fs.run_archive_files import dropped_bytes, packed_bytes
from quodeq.services.storage_report import ARCHIVE_SAVING, ARCHIVE_SAVING_REPORTS, clean_preview
from tests.services._archive_fixtures import NOW, make_run


def _archived_the_old_way(root, run_id, days):
    """A run archived by 1.15.0: packed logs, no database, plain reports beside the archive."""
    run = make_run(root, run_id, days=days)
    archive_keeping_keys(run, NULL_LOG)
    packed = run / "evaluation" / "security.json.gz"
    (run / "evaluation" / "security.json").write_bytes(gzip.decompress(packed.read_bytes()))
    packed.unlink()
    return run


def test_the_pass_packs_the_reports_of_runs_archived_earlier(tmp_path):
    old = _archived_the_old_way(tmp_path, "run-old", 400)
    make_run(tmp_path, "run-new", days=10)
    plan = plan_cleanup(tmp_path, NOW, 1)
    assert plan.pack == (old,) and plan.archive == ()

    result = run_cleanup(tmp_path, NOW, keep_runs=1)

    assert result.packed == 1 and result.bytes_freed > 0
    assert is_archived(old)  # never restored
    assert (old / "evaluation" / "security.json.gz").is_file() and not (old / "evaluation" / "security.json").exists()


def test_the_preview_counts_the_report_saving(tmp_path):
    old = make_run(tmp_path, "run-old", days=400)
    make_run(tmp_path, "run-new", days=10)
    report = (old / "evaluation" / "security.json").stat().st_size
    expected = dropped_bytes(old) + ARCHIVE_SAVING * packed_bytes(old) + ARCHIVE_SAVING_REPORTS * report
    preview = clean_preview(tmp_path, NOW, 1)
    assert preview.archive == 1 and preview.frees == int(expected)


def test_the_preview_counts_runs_whose_reports_wait_to_be_packed(tmp_path):
    old = _archived_the_old_way(tmp_path, "run-old", 400)
    make_run(tmp_path, "run-new", days=10)
    report = (old / "evaluation" / "security.json").stat().st_size
    preview = clean_preview(tmp_path, NOW, 1)
    assert preview.archive == 1 and preview.frees == int(ARCHIVE_SAVING_REPORTS * report)
