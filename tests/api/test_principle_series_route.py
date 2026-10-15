"""GET /api/projects/<p>/dimensions/<dim>/principle-series on the golden project.

Its latest run carries a dismissal, a deletion and a suppression rule, so the
series is read through the same rescored rows the Overview's grades come from.
"""
from __future__ import annotations

from dataclasses import replace
from http import HTTPStatus

import pytest

from quodeq.api.app import create_app
from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.services.dismissed import dismiss_finding, restore_finding
from tests.perf._golden_fixture import DIMENSION, LATEST_RUN_ID, PARTIAL_RUN_ID, PROJECT, RUN_IDS, seed_golden_project

pytestmark = pytest.mark.real_standards

_SERIES = f"/api/projects/{PROJECT}/dimensions/{DIMENSION}/principle-series"
_OVERVIEW = f"/api/projects/{PROJECT}/dashboard?view=overview"
_INTEGRITY = "Integrity"
# A live Integrity violation of the latest run (S-INT-1 in f8.py, see _budget_fixture._violation).
_TARGET = {"req": "S-INT-1", "file": "f8.py", "line": 18}


@pytest.fixture()
def project(tmp_path, monkeypatch):
    monkeypatch.delenv("QUODEQ_API_KEY", raising=False)
    reports = tmp_path / "evaluations"
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(reports))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    project_dir = seed_golden_project(reports)
    return project_dir, create_app(static_dist=None, api_key=None).test_client()


def _latest_point(client, name: str) -> dict:
    (latest, *_older) = client.get(_SERIES).get_json()["rows"]
    return next(p for p in latest["principles"] if p["principle"] == name)


def test_a_row_per_finished_run_newest_first_matching_the_shown_grades(project):
    _dir, client = project
    rows = client.get(_SERIES).get_json()["rows"]
    assert [r["runId"] for r in rows] == [r for r in reversed(RUN_IDS) if r != PARTIAL_RUN_ID]
    shown = next(d for d in client.get(_OVERVIEW).get_json()["dimensions"] if d["dimension"] == DIMENSION)
    assert rows[0]["runId"] == LATEST_RUN_ID
    assert {p["principle"]: (p["score"], p["grade"]) for p in rows[0]["principles"]} == {
        p["principle"]: (float(p["score"].split("/")[0]), p["grade"]) for p in shown["principles"]
    }


def test_dismiss_and_restore_move_the_principle_point(project):
    project_dir, client = project
    before = _latest_point(client, _INTEGRITY)
    dismiss_finding(project_dir, _TARGET)
    dismissed = _latest_point(client, _INTEGRITY)
    restore_finding(project_dir, _TARGET)
    assert dismissed["violations"] == before["violations"] - 1
    assert dismissed["score"] != before["score"]
    assert _latest_point(client, _INTEGRITY) == before


def test_a_formula_change_moves_the_principle_scores(project, monkeypatch):
    _dir, client = project
    before = _latest_point(client, _INTEGRITY)
    harsher = replace(DEFAULT_PARAMS, base_k=DEFAULT_PARAMS.base_k * 4)
    # The saved formula, as ProjectRows reads it for every row it grades.
    monkeypatch.setattr("quodeq.services.scoring._project_rows.load_params", lambda *_a, **_k: harsher)
    after = _latest_point(client, _INTEGRITY)
    assert after["score"] < before["score"]
    assert after["violations"] == before["violations"]


def test_an_unknown_dimension_or_project_is_a_written_404(project):
    _dir, client = project
    resp = client.get(f"/api/projects/{PROJECT}/dimensions/usability/principle-series")
    assert resp.status_code == HTTPStatus.NOT_FOUND
    assert resp.get_json()["error"] == "No evaluation in this project scored the dimension 'usability'"
    missing = client.get(f"/api/projects/nope/dimensions/{DIMENSION}/principle-series")
    assert (missing.status_code, missing.get_json()["error"]) == (HTTPStatus.NOT_FOUND, "Project not found")


def test_a_hidden_standard_answers_no_rows(project, tmp_path):
    project_dir, client = project
    from quodeq.data.fs.standards_prefs import save_enabled_ids
    save_enabled_ids(project_dir.parent, project_dir.name, ["reliability"])
    assert client.get(_SERIES).get_json() == {"dimension": DIMENSION, "rows": []}
