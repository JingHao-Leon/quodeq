"""The JS scorer mirror's parity fixture, written from the Python scorer.

ui/src/features/grade-formula/scoring/livePreview.test.js reproduces every
number in it. This test fails when the committed fixture no longer matches
what the scorer produces: run it with QUODEQ_WRITE_PARITY_FIXTURE=1 to
rewrite it, then make the JS mirror pass again.
"""
from __future__ import annotations

import json
import os
import random
from pathlib import Path

from quodeq.core.scoring.internals import principle_stages
from quodeq.core.scoring.mass import PrincipleMass
from quodeq.core.scoring.params import DEFAULT_PARAMS, params_from_dict, params_to_dict
from quodeq.core.scoring.projector_scoring import compute_dimension_score, compute_run_score

FIXTURE = Path(__file__).resolve().parents[2] / "src/quodeq/ui/src/features/grade-formula/scoring/parity.fixture.json"
_WORST = ["critical", "major", "minor", None]
_DIMS = ["security", "reliability", "maintainability", "clean-architecture"]


def _principle(rng: random.Random, i: int) -> dict:
    worst = rng.choice(_WORST)
    crit = rng.uniform(0, 2) if worst == "critical" else 0.0
    major = rng.uniform(0, 6) if worst in ("critical", "major") else 0.0
    minor = rng.uniform(0, 10) if worst is not None else 0.0
    return {"id": f"P{i}", "massMinor": round(minor, 6), "massMajor": round(major, 6), "massCritical": round(crit, 6),
            "complianceMass": round(rng.uniform(0, 30), 6), "observation": round(rng.uniform(0.5, 40), 6),
            "worst": worst}


def _project(rng: random.Random, n: int) -> dict:
    dims = []
    for d in rng.sample(_DIMS, rng.randint(1, len(_DIMS))):
        if rng.random() < 0.15:
            dims.append({"dimension": d, "frozenScore": round(rng.uniform(2, 9.5), 1), "principles": []})
        else:
            dims.append({"dimension": d, "frozenScore": None,
                         "principles": [_principle(rng, i) for i in range(rng.randint(1, 6))]})
    return {"id": f"proj{n}", "dimensions": dims}


def _score(p: dict, params) -> float:
    w = params.severity_weight
    mass = PrincipleMass(
        violation_mass=p["massMinor"] * w["minor"] + p["massMajor"] * w["major"] + p["massCritical"] * w["critical"],
        compliance_mass=p["complianceMass"], observation=p["observation"], worst=p["worst"],
        violations=(), compliance=(),
    )
    return principle_stages(mass, params=params)[3]


def _expected(project: dict, params) -> dict:
    principles, dims = {}, []
    for d in project["dimensions"]:
        if d["frozenScore"] is not None:
            dims.append({"dimension": d["dimension"], "score": d["frozenScore"]})
            continue
        grades = []
        for p in d["principles"]:
            s = _score(p, params)
            principles[f"{d['dimension']}/{p['id']}"] = s
            grades.append({"score": s, "observation": p["observation"]})
        dims.append({"dimension": d["dimension"],
                     "score": compute_dimension_score(dimension=d["dimension"], principle_grades=grades, params=params)["score"]})
    return {"overall": compute_run_score(dims, params)["score"],
            "dimensions": {d["dimension"]: d["score"] for d in dims}, "principles": principles}


def _param_sets() -> list:
    base = params_to_dict(DEFAULT_PARAMS)
    variants = [
        {},
        {"severityWeight": {"minor": 0.5, "major": 3.0, "critical": 6.0}, "baseK": 0.1},
        {"liftCompress": 1.2, "ceilScale": 1.4, "floorMinor": 6.0, "floorMajor": 2.0},
        {"gradeThresholds": [[9.5, "Exemplary"], [8.0, "Good"], [5.0, "Adequate"], [3.0, "Poor"]],
         "dimensionWeightsEnabled": True,
         "dimensionWeights": {**base["dimensionWeights"], "security": 2.5, "reliability": 0.4}},
        {"dimensionWeightsEnabled": False, "ceilScale": 0.0},
    ]
    return [params_from_dict({**base, **v}) for v in variants]


def build_fixture() -> dict:
    rng = random.Random(20261015)
    projects = [_project(rng, n) for n in range(12)]
    rounding = [[x, round(x, 1)] for x in (0.25, 0.75, 1.25, 1.75, 2.25, 7.25, 7.75, 8.45, 2.675, 6.05, 9.95, 3.3500000000000001)]
    return {
        "rounding": rounding,
        "cases": [{"params": params_to_dict(p), "projects": projects,
                   "expected": {pr["id"]: _expected(pr, p) for pr in projects}} for p in _param_sets()],
    }


def test_the_committed_parity_fixture_matches_the_scorer():
    fixture = build_fixture()
    if os.environ.get("QUODEQ_WRITE_PARITY_FIXTURE") == "1":
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(json.dumps(fixture, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    assert json.loads(FIXTURE.read_text(encoding="utf-8")) == fixture
