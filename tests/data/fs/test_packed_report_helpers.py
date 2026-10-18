"""Every report helper sees a packed report as its dimension, with the same stamp and date as the plain one."""
from __future__ import annotations

import json

import pytest

from quodeq.ci.reporter import load_evaluation_reports
from quodeq.data.fs.report_parser import find_date_in_dir, load_evaluations, safe_read_dir
from quodeq.data.fs.report_parser.finding_details import (
    eval_report_dimensions, iter_eval_reports, iter_readable_eval_reports, read_eval_report,
)
from quodeq.data.fs.run_dirs import run_dimension_ids
from quodeq.data.fs.run_files import count_eval_files, dimension_report_exists
from quodeq.data.projection.grade_projector import report_stamp
from tests.data.fs._report_fixtures import pack_reports, write_report
from tests.services._archive_fixtures import make_run


def _dated_run(tmp_path):
    run = make_run(tmp_path, "r1")
    path = run / "evaluation" / "security.json"
    path.write_text(json.dumps({**json.loads(path.read_text()), "date": "2026-10-01T10:00:00Z"}))
    return run


def test_every_helper_sees_a_packed_report_as_its_dimension(tmp_path):
    run = make_run(tmp_path, "r1")
    pack_reports(run)
    eval_dir = run / "evaluation"
    assert [d for d, _ in iter_eval_reports(eval_dir)] == ["security"]
    assert [d for d, _ in iter_readable_eval_reports(run)] == ["security"]
    assert eval_report_dimensions(run) == ["security"] and run_dimension_ids(run) == frozenset({"security"})
    assert read_eval_report(eval_dir, "security")["dimension"] == "security"
    assert count_eval_files(run) == 1 and dimension_report_exists(eval_dir, "security")
    assert [e["dimension"] for e in load_evaluations(eval_dir)] == ["security"]


def test_report_stamp_and_date_survive_packing(tmp_path):
    run = _dated_run(tmp_path)
    before = (report_stamp(run), find_date_in_dir(run / "evaluation", ".json", safe_read_dir))
    pack_reports(run)
    assert before[0] != "0" and before[1] is not None
    assert (report_stamp(run), find_date_in_dir(run / "evaluation", ".json", safe_read_dir)) == before


def test_a_corrupt_packed_report_is_skipped_like_bad_json(tmp_path):
    run = make_run(tmp_path, "r1")
    pack_reports(run)
    (run / "evaluation" / "security.json.gz").write_bytes(b"\x1f\x8b not gzip")
    assert list(iter_readable_eval_reports(run)) == []
    assert list(iter_eval_reports(run / "evaluation", skip_corrupt=True)) == []
    with pytest.raises((OSError, EOFError)):
        read_eval_report(run / "evaluation", "security")


def test_the_ci_reporter_loads_packed_reports_and_skips_full(tmp_path):
    run = make_run(tmp_path, "r1")
    write_report(run / "evaluation", "security_full", {"dimension": "x"})
    pack_reports(run)
    assert [r["dimension"] for r in load_evaluation_reports(run / "evaluation")] == ["security"]
