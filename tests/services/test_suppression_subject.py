import pytest

from quodeq.core.dismissals import DismissedEntry, DismissedKeys
from quodeq.core.finding_identity import snippet_fingerprint
from quodeq.core.types.suppression_rule import SuppressionRule
from quodeq.services.suppression_keys import SuppressionKeys
from quodeq.services.violations import is_suppressed_subject, is_suppressed_violation, suppression_subject

DIM = "security"
V = {"req": "R1", "file": "x/a.py", "line": 4, "snippet": "a()", "practiceId": "Secure Design", "severity": "major"}

KEYS = {
    "nothing": SuppressionKeys(DismissedKeys()),
    "fingerprint": SuppressionKeys(DismissedKeys(entries=(DismissedEntry("R1", "x/a.py", 1, snippet_fingerprint("R1", "a()")),))),
    "line": SuppressionKeys(DismissedKeys(entries=(DismissedEntry("R1", "x/a.py", 4),))),
    "other line": SuppressionKeys(DismissedKeys(entries=(DismissedEntry("R1", "x/a.py", 5),))),
    "deleted": SuppressionKeys(DismissedKeys(), frozenset({(DIM, "Secure Design", "x/a.py")})),
    "rule": SuppressionKeys(DismissedKeys(), rules=(SuppressionRule("R*", "x/*", "fixture"),)),
}
VIOLATIONS = {
    "plain": V,
    "no snippet": {**V, "snippet": None},
    "no req": {**V, "req": None},
    "combined file:line": {**V, "file": "x/a.py:4", "line": None},
    "combined non-numeric suffix": {**V, "file": "x/a.py:tail", "line": None},
    "principle only": {k: v for k, v in V.items() if k != "practiceId"} | {"principle": "Secure Design"},
}


@pytest.mark.parametrize("keys_name", sorted(KEYS))
@pytest.mark.parametrize("violation_name", sorted(VIOLATIONS))
def test_a_stored_subject_is_judged_like_the_violation(keys_name, violation_name):
    keys, v = KEYS[keys_name], VIOLATIONS[violation_name]
    assert is_suppressed_subject(suppression_subject(v, DIM), keys) == is_suppressed_violation(v, keys, DIM)


def test_the_subject_keeps_the_fingerprints_not_the_snippet():
    subject = suppression_subject(V, DIM)
    assert subject.fingerprints == (snippet_fingerprint("R1", "a()"),)
    assert (subject.file, subject.line, subject.deleted_file) == ("x/a.py", 4, "x/a.py")
    assert "a()" not in repr(subject)
