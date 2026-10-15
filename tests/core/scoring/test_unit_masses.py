"""unit_masses: a principle's violation mass split per unit of each severity weight."""
from __future__ import annotations

import dataclasses

import pytest

from quodeq.core.scoring.mass import principle_mass, requirement_rows, unit_masses
from quodeq.core.scoring.params import DEFAULT_PARAMS


def _rows():
    violations = [
        {"req": "R1", "file": "a.py", "severity": "critical", "verdict": "violation"},
        {"req": "R1", "file": "b.py", "severity": "major", "verdict": "violation"},
        {"req": "R2", "file": "c.py", "severity": "minor", "verdict": "violation"},
        {"req": "R2", "file": "d.py", "severity": "major", "verdict": "violation"},
    ]
    compliance = [{"req": "C1", "file": "e.py", "verdict": "compliance"}]
    return requirement_rows(violations, compliance, [])


@pytest.mark.parametrize("weights", [
    {"minor": 0.25, "major": 2.0, "critical": 4.0},
    {"minor": 1.0, "major": 3.0, "critical": 9.5},
    {"minor": 0.05, "major": 0.1, "critical": 0.15},
])
def test_unit_masses_recombine_into_the_violation_mass(weights):
    params = dataclasses.replace(DEFAULT_PARAMS, severity_weight=weights)
    mass = principle_mass(_rows(), 100, params=params)

    units = unit_masses(mass)
    recombined = units["minor"] * weights["minor"] + units["major"] * weights["major"] + units["critical"] * weights["critical"]

    assert recombined == pytest.approx(mass.violation_mass, rel=1e-12)


def test_unit_masses_do_not_depend_on_the_weights():
    a = unit_masses(principle_mass(_rows(), 100, params=DEFAULT_PARAMS))
    heavy = dataclasses.replace(DEFAULT_PARAMS, severity_weight={"minor": 1.0, "major": 3.0, "critical": 9.5})
    b = unit_masses(principle_mass(_rows(), 100, params=heavy))
    assert a == pytest.approx(b)


def test_numerical_principle_score_carries_unit_masses_and_worst():
    from quodeq.core.scoring import principle
    from quodeq.core.scoring.overall import MODE_NUMERICAL
    from quodeq.core.scoring.scale import PrincipleGradeScale

    raw = {"P1": {"metrics": {"confidence_level": "high"},
                  "violations": [{"req": "R1", "file": "a.py", "severity": "critical", "reason": "r"},
                                 {"req": "R2", "file": "b.py", "severity": "minor", "reason": "r2"}],
                  "compliance": [{"req": "C1", "file": "c.py", "severity": "minor", "reason": "c"}]}}
    scored = principle.score_all_principles(raw, MODE_NUMERICAL, PrincipleGradeScale(), 10)["P1"]

    assert scored.worst == "critical"
    assert set(scored.unit_masses) == {"minor", "major", "critical"}
    assert scored.unit_masses["critical"] > 0
