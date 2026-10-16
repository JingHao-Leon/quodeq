"""get_grade_formula: the grade formula in effect, so the assistant can say whether grades use a tuned one."""
from __future__ import annotations

from quodeq.assistant.tools._constants import JSON_SCHEMA_TYPE_OBJECT
from quodeq.assistant.tools.registry import ToolRegistry, ToolSpec
from quodeq.core.scoring.params import DEFAULT_PARAMS, params_to_dict
from quodeq.services import grade_formula


def _get_grade_formula() -> dict:
    return {
        "current": params_to_dict(grade_formula.load_params()),
        "defaults": params_to_dict(DEFAULT_PARAMS),
        "isCustom": grade_formula.is_custom(),
    }


def register_formula_tool(registry: ToolRegistry) -> None:
    """Read-only on purpose: applying a formula rescores every project, so it stays a page action."""
    registry.register(ToolSpec(
        "get_grade_formula",
        "The grade formula every grade on this machine uses: current parameters, the Q2 "
        "defaults and isCustom (true when the user tuned it on the Grade formula page). "
        "Use it before explaining why a grade is what it is or how severities are weighted. "
        "Read-only: point the user to the Grade formula page to change it.",
        {"type": JSON_SCHEMA_TYPE_OBJECT, "properties": {}},
        lambda **_kw: _get_grade_formula()))
