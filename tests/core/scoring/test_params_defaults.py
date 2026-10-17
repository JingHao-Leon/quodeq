"""The spec's constants are the defaults, and weights must climb the ladder."""
from __future__ import annotations

import dataclasses

from quodeq.core.scoring.constants import BASE_K, LIFT_COMPRESS, SEVERITY_GRADE_FLOOR, SEVERITY_WEIGHT
from quodeq.core.scoring.params import DEFAULT_PARAMS, params_from_dict, params_to_dict, ranges_to_dict, validate_params


def test_defaults_match_the_spec():
    assert SEVERITY_WEIGHT == {"critical": 7.5, "major": 2.0, "minor": 0.15}
    assert BASE_K == 0.07
    assert LIFT_COMPRESS == 2.0
    assert SEVERITY_GRADE_FLOOR == {"critical": 0.0, "major": 2.5, "minor": 5.0}
    assert (DEFAULT_PARAMS.floor_major, DEFAULT_PARAMS.floor_minor) == (2.5, 5.0)
    assert validate_params(DEFAULT_PARAMS) == []


def test_non_increasing_weights_are_rejected():
    params = dataclasses.replace(DEFAULT_PARAMS, severity_weight={"critical": 4.0, "major": 4.0, "minor": 0.25})
    errors = validate_params(params)
    assert any("strictly increasing" in e for e in errors)


def test_a_none_weight_is_an_error_not_a_crash():
    params = dataclasses.replace(DEFAULT_PARAMS, severity_weight={"critical": 4.0, "major": None, "minor": 0.25})
    errors = validate_params(params)
    assert any("strictly increasing" in e for e in errors)


def test_a_critical_weight_up_to_25_is_accepted():
    params = dataclasses.replace(DEFAULT_PARAMS, severity_weight={"critical": 25.0, "major": 2.0, "minor": 0.15})
    assert validate_params(params) == []


def test_a_critical_weight_past_25_is_rejected():
    params = dataclasses.replace(DEFAULT_PARAMS, severity_weight={"critical": 25.05, "major": 2.0, "minor": 0.15})
    errors = validate_params(params)
    assert any("severity_weight[critical] must be between 0.05 and 25.0" in e for e in errors)


def test_every_served_bound_is_a_value_the_validator_accepts():
    """Each knob at either end of its served range passes validation (the sliders' promise)."""
    base = params_to_dict(DEFAULT_PARAMS)
    for key in ("baseK", "liftCompress", "ceilScale"):
        for bound in ranges_to_dict()[key]:
            assert validate_params(params_from_dict({**base, key: bound})) == [], (key, bound)
