"""The Grade Formula help page's defaults table matches the scoring constants.

The in-app assistant quotes the Help verbatim and the website builds its docs
from the same file, so a default changed in code must change on the page too.
"""
import re

import pytest

from quodeq.assistant.tools.help_tools import HELP_DIR
from quodeq.core.scoring import constants
from quodeq.core.types.severity import Severity

_PAGE = HELP_DIR / "grade-formula.md"
_SECTION = "### Q² defaults"
_ROW = re.compile(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$")
_NUMBER = re.compile(r"\d+(?:\.\d+)?")


def _defaults_table() -> dict[str, str]:
    text = _PAGE.read_text(encoding="utf-8")
    assert _SECTION in text, f"{_PAGE.name} lost its '{_SECTION}' section"
    section = text.split(_SECTION, 1)[1].split("\n### ", 1)[0]
    rows = {}
    for line in section.splitlines():
        match = _ROW.match(line.strip())
        if match and match.group(1) not in {"Key", "---"}:
            rows[match.group(1)] = match.group(2)
    return rows


_EXPECTED = {
    "Critical weight": constants.SEVERITY_WEIGHT[Severity.CRITICAL],
    "Major weight": constants.SEVERITY_WEIGHT[Severity.MAJOR],
    "Minor weight": constants.SEVERITY_WEIGHT[Severity.MINOR],
    "Strictness K": constants.BASE_K,
    "Lift compress": constants.LIFT_COMPRESS,
    "Ceiling scale": constants.CEIL_SCALE,
    "Minor-only floor": constants.SEVERITY_GRADE_FLOOR[Severity.MINOR],
    "Major floor": constants.SEVERITY_GRADE_FLOOR[Severity.MAJOR],
}


@pytest.mark.parametrize(("key", "expected"), sorted(_EXPECTED.items()))
def test_each_documented_default_matches_its_constant(key, expected):
    value = _defaults_table().get(key)
    assert value is not None, f"{_PAGE.name} defaults table has no '{key}' row"
    assert float(value) == pytest.approx(expected), f"'{key}' says {value}, the code uses {expected}"


def test_documented_grade_thresholds_match_the_constants():
    row = _defaults_table().get("Grade thresholds")
    assert row is not None, f"{_PAGE.name} defaults table has no 'Grade thresholds' row"
    documented = [float(n) for n in _NUMBER.findall(row)]
    assert documented == [float(threshold) for threshold, _grade in constants.GRADE_THRESHOLDS]
    for _threshold, grade in constants.GRADE_THRESHOLDS:
        assert grade.value in row, f"'Grade thresholds' does not name {grade.value}"


def test_the_defaults_table_documents_nothing_unknown():
    assert set(_defaults_table()) == {*_EXPECTED, "Grade thresholds"}
