"""The trend's principle series moves with dismissals and the grade formula, like the dimension scores.

Runs on the golden project (a dismissal, a deletion and a suppression rule on
its latest run), through the API the Overview reads.
"""
from __future__ import annotations

from dataclasses import replace

import pytest

from quodeq.api.app import create_app
from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.services.dismissed import dismiss_finding, restore_finding
from tests.perf._golden_fixture import DIMENSION, PROJECT, seed_golden_project

pytestmark = pytest.mark.real_standards

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


def _latest_principle(client, name: str) -> dict:
    payload = client.get(_OVERVIEW).get_json()
    detail = next(d for d in payload["trend"][0]["dimensionDetails"] if d["dimension"] == DIMENSION)
    return next(p for p in detail["principles"] if p["principle"] == name)


def test_dismiss_and_restore_move_the_principle_point(project):
    project_dir, client = project
    before = _latest_principle(client, _INTEGRITY)

    dismiss_finding(project_dir, _TARGET)
    dismissed = _latest_principle(client, _INTEGRITY)
    restore_finding(project_dir, _TARGET)
    restored = _latest_principle(client, _INTEGRITY)

    assert dismissed["violations"] == before["violations"] - 1
    assert dismissed["score"] != before["score"]
    assert restored == before


def test_the_principle_point_is_the_score_the_principle_grade_shows(project):
    _project_dir, client = project
    payload = client.get(_OVERVIEW).get_json()
    shown = next(d for d in payload["dimensions"] if d["dimension"] == DIMENSION)["principles"]
    detail = next(d for d in payload["trend"][0]["dimensionDetails"] if d["dimension"] == DIMENSION)
    assert {p["principle"]: (p["score"], p["grade"]) for p in detail["principles"]} == {
        p["principle"]: (float(p["score"].split("/")[0]), p["grade"]) for p in shown
    }


def test_a_formula_change_moves_the_principle_scores(project, monkeypatch):
    from quodeq.services import grade_formula

    _project_dir, client = project
    before = _latest_principle(client, _INTEGRITY)
    harsher = replace(DEFAULT_PARAMS, base_k=DEFAULT_PARAMS.base_k * 4)
    monkeypatch.setattr(grade_formula, "load_params", lambda *_a, **_k: harsher)
    after = _latest_principle(client, _INTEGRITY)

    assert after["score"] < before["score"]
    assert after["violations"] == before["violations"]
