"""An archived run's scalars come from ``scalars.json``, written at archive time: listings never restore it."""
from __future__ import annotations

import json
import tarfile
from pathlib import Path

import pytest

from quodeq.data.fs import run_archive
from quodeq.data.fs.report_parser.runs import read_run_scalars
from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, RunArchiveError, archive_run, ensure_restored, is_archived
from quodeq.data.fs.run_scalars import SCALARS_NAME, read_scalars
from quodeq.services.accumulated import read_scalar_dimensions
from quodeq.services.runs_unit import build_runs_unit
from tests.services._archive_fixtures import PROJECT, make_run


def _scalars(root: Path, run: Path):
    return read_run_scalars(root, PROJECT, run.name)


def _fail(*_a, **_k):
    raise AssertionError("an archived run must never reach the fallback reader")


def test_archived_scalars_equal_the_live_ones_and_never_restore(tmp_path):
    run = make_run(tmp_path, "run-old")
    live = _scalars(tmp_path, run)
    live_walk = read_scalar_dimensions(tmp_path, PROJECT, run.name)
    archive_run(run)

    assert read_run_scalars(tmp_path, PROJECT, run.name, fallback_reader=_fail) == live
    assert read_scalar_dimensions(tmp_path, PROJECT, run.name) == live_walk
    assert is_archived(run) and not (run / "evaluation.db").exists()


def test_the_sidecar_is_kept_beside_the_archive_and_survives_a_restore(tmp_path):
    run = make_run(tmp_path, "run-old")
    archive_run(run)
    with tarfile.open(run / ARCHIVE_FILENAME) as tar:
        assert SCALARS_NAME not in tar.getnames()

    ensure_restored(run)

    assert (run / SCALARS_NAME).is_file() and not is_archived(run)


def test_an_aborted_archive_leaves_no_sidecar(tmp_path, monkeypatch):
    run = make_run(tmp_path, "run-old")
    real = run_archive._write_archive

    def write_then_add(tmp, sources):
        real(tmp, sources)
        (run / "evidence").mkdir(exist_ok=True)
        (run / "evidence" / "late_evidence.jsonl").write_text("{}\n")

    monkeypatch.setattr(run_archive, "_write_archive", write_then_add)
    with pytest.raises(RunArchiveError):
        archive_run(run)

    assert not is_archived(run) and not (run / SCALARS_NAME).exists()


def test_without_a_sidecar_an_archived_run_reads_its_reports(tmp_path):
    run = make_run(tmp_path, "run-old")
    archive_run(run)
    (run / SCALARS_NAME).unlink()

    dims = read_run_scalars(tmp_path, PROJECT, run.name, fallback_reader=_fail)

    assert [(d.dimension, d.overall_grade) for d in dims] == [("security", "C")]  # the report's frozen grade
    assert is_archived(run)


@pytest.mark.parametrize("text", ["not json", "[]", '{"version": 1}', '{"version": 1, "dimensions": [{"x": 1}]}',
                                  '{"version": 1, "dimensions": [], "principles": [], "counts": {}}'])
def test_a_malformed_sidecar_reads_as_missing(tmp_path, text):
    run = make_run(tmp_path, "run-old")
    archive_run(run)
    (run / SCALARS_NAME).write_text(text)

    assert read_scalars(run) is None
    assert read_run_scalars(tmp_path, PROJECT, run.name, fallback_reader=_fail)
    assert is_archived(run)


def test_a_symlinked_sidecar_reads_as_missing(tmp_path):
    run = make_run(tmp_path, "run-old")
    archive_run(run)
    real = tmp_path / "elsewhere.json"
    (run / SCALARS_NAME).rename(real)
    (run / SCALARS_NAME).symlink_to(real)

    assert read_scalars(run) is None


def test_a_planted_tmp_symlink_is_never_followed(tmp_path):
    run = make_run(tmp_path, "run-old")
    outside = tmp_path / "outside.txt"
    outside.write_text("keep me")
    (run / f"{SCALARS_NAME}.tmp").symlink_to(outside)

    archive_run(run)

    assert outside.read_text() == "keep me"
    assert json.loads((run / SCALARS_NAME).read_text())["dimensions"]


def test_the_run_list_memo_keys_an_archived_run_on_its_sidecar(tmp_path):
    index_db = tmp_path / "index.db"
    run = make_run(tmp_path, "run-old")
    archive_run(run)
    before = build_runs_unit(tmp_path, index_db, PROJECT)[0]["overallScore"]
    data = json.loads((run / SCALARS_NAME).read_text())
    data["dimensions"][0]["score"] = 1.5
    (run / SCALARS_NAME).write_text(json.dumps(data) + " ")

    after = build_runs_unit(tmp_path, index_db, PROJECT)[0]["overallScore"]

    assert before != 1.5 and after == 1.5
