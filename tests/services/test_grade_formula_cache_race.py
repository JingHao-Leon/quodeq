"""A dashboard read during a grade-formula rescore must not pin old grades.

Saving a formula changes every run's cache version at once, but the rescore
pass rewrites the runs one at a time. A read in between served a run's
not-yet-rewritten grade tables and persisted them under the NEW version, so
once the pass finished that run kept its old-formula scores in the trend, the
overall gauge and Compare until something else changed the version.
"""
from __future__ import annotations

import dataclasses
import json
from pathlib import Path

import pytest

from quodeq.core.events.models import Judgment
from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.data.projection.grade_projector import compute_run_grades, recompute_grades
from quodeq.data.sqlite.state_store import SQLiteStateStore
from quodeq.services import grade_formula
from quodeq.services.dashboard import clear_shared_dimension_cache
from quodeq.services.scoring import get_project_scores

from tests.services._grade_formula_fixtures import formula_path  # noqa: F401 -- pytest fixture

_LENIENT = dataclasses.replace(
    DEFAULT_PARAMS, severity_weight={"critical": 4.0, "major": 0.5, "minor": 0.05},
)


@pytest.fixture(autouse=True)
def _clear_cache():
    clear_shared_dimension_cache()
    yield
    clear_shared_dimension_cache()


def _graded_run(reports: Path) -> Path:
    """A run with findings, its grade tables computed under the stock formula."""
    run_dir = reports / "proj" / "run1"
    run_dir.mkdir(parents=True)
    (run_dir / "events.jsonl").write_text("")
    store = SQLiteStateStore(run_dir)
    store.save_projected_size(0)
    for i in range(6):
        store.record_finding(Judgment(
            practice_id="p1", dimension="security", req=f"req{i}",
            verdict="violation", severity="major", file=f"f{i}.py", line=1,
            title=f"t{i}", reason=f"r{i}",
        ))
    for i in range(8):
        store.record_finding(Judgment(
            practice_id="p1", dimension="security", req=f"c{i}",
            verdict="compliance", severity="minor", file=f"g{i}.py", line=1,
            title=f"ct{i}", reason=f"cr{i}",
        ))
    eval_dir = run_dir / "evaluation"
    eval_dir.mkdir()
    (eval_dir / "security.json").write_text(json.dumps({
        "schema_version": 1, "dimension": "security", "discipline": "Python",
        "date": "2026-10-18", "sourceFileCount": 100, "filesRead": 100,
        "principles": [], "violations": [], "compliance": [],
        "totals": {"violationCount": 6, "complianceCount": 8, "severity": {"major": 6}},
    }), encoding="utf-8")
    evidence_dir = run_dir / "evidence"
    evidence_dir.mkdir()
    (evidence_dir / "manifest.json").write_text(json.dumps({"language_stats": {}}), encoding="utf-8")
    recompute_grades(run_dir, params=DEFAULT_PARAMS)
    return run_dir


def _shown_scores(reports: Path) -> tuple[dict[str, float], float]:
    """(the trend point's dimension scores, the overall gauge's average)."""
    payload = get_project_scores(reports, "proj")
    assert payload is not None
    (point,) = payload["trend"]
    trend = {d["dimension"]: d["score"] for d in point["dimensionDetails"]}
    return trend, payload["accumulated"]["summary"]["numericAverage"]


def test_read_mid_rescore_does_not_pin_the_old_grades(tmp_path, formula_path):
    reports = tmp_path / "evaluations"
    run_dir = _graded_run(reports)
    _, stock_rows = compute_run_grades(run_dir, DEFAULT_PARAMS)
    _, lenient_rows = compute_run_grades(run_dir, _LENIENT)
    stock = {r["dimension"]: r["score"] for r in stock_rows}
    lenient = {r["dimension"]: r["score"] for r in lenient_rows}
    assert stock != lenient  # the formula change actually moves this run

    grade_formula.save_params(_LENIENT)
    # The dashboard polls before the pass reaches this run.
    assert _shown_scores(reports) == (stock, stock["security"])
    # The pass rewrites the run under the saved formula.
    recompute_grades(run_dir, params=_LENIENT)
    clear_shared_dimension_cache()  # what apply_to_all_runs does on exit

    assert _shown_scores(reports) == (lenient, lenient["security"])
