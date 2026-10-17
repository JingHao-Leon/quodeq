"""The browser's Risk weights (Findings headers, the Map's fallback) are the grade formula's default severity weights.

The server weighs areas with the formula in effect; a stale copy in the UI put
the same folder in different zones on different screens after formula v7.
"""
import re
from pathlib import Path

from quodeq.core.scoring.constants import SEVERITY_WEIGHT

RISK_RULES = Path(__file__).resolve().parents[1] / "src/quodeq/ui/src/models/riskRules.js"


def _ui_weights() -> dict[str, float]:
    line = next(ln for ln in RISK_RULES.read_text(encoding="utf-8").splitlines() if "SEVERITY_WEIGHTS = " in ln)
    return {sev.lower(): float(v) for sev, v in re.findall(r"\[SEVERITY\.(\w+)\]:\s*([\d.]+)", line)}


def test_ui_risk_weights_equal_the_formula_defaults():
    expected = {str(sev.value): weight for sev, weight in SEVERITY_WEIGHT.items()}
    assert _ui_weights() == expected
