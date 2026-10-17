import pytest

from quodeq.core.dismissals import DismissedEntry, DismissedKeys
from quodeq.core.finding_identity import dismiss_fingerprints, snippet_fingerprint


def test_fingerprints_follow_the_dismiss_identities():
    assert dismiss_fingerprints("R1", "P", "x()") == (snippet_fingerprint("R1", "x()"),)
    assert dismiss_fingerprints(None, "P", "x()") == (snippet_fingerprint("P", "x()"), snippet_fingerprint("", "x()"))
    assert dismiss_fingerprints("R1", "P", "   ") == (None,)


FP = snippet_fingerprint
CASES = [
    # (stored entry, finding, expected): fingerprint match survives a line shift
    (DismissedEntry("R1", "a.py", 3, FP("R1", "x()")), {"req": "R1", "file": "a.py", "line": 9, "snippet": "x()"}, True),
    # a snippet-less finding matches on its line
    (DismissedEntry("R1", "a.py", 3), {"req": "R1", "file": "a.py", "line": 3, "snippet": None}, True),
    # a legacy unresolved entry still hides a finding that has a snippet, on its line
    (DismissedEntry("R1", "a.py", 3), {"req": "R1", "file": "a.py", "line": 3, "snippet": "x()"}, True),
    # no req: the principle stands in, as the UI stores it
    (DismissedEntry("P", "a.py", 3, FP("P", "x()")), {"req": None, "principle": "P", "file": "a.py", "line": 1, "snippet": "x()"}, True),
    # no req: the assistant's empty-req form
    (DismissedEntry("", "a.py", 3, FP("", "x()")), {"req": None, "principle": "P", "file": "a.py", "line": 1, "snippet": "x()"}, True),
    # another file never matches
    (DismissedEntry("R1", "b.py", 3, FP("R1", "x()")), {"req": "R1", "file": "a.py", "line": 3, "snippet": "x()"}, False),
]


@pytest.mark.parametrize(("entry", "finding", "expected"), CASES)
def test_stored_fingerprints_match_like_the_snippet(entry, finding, expected):
    keys = DismissedKeys(entries=(entry,))
    fps = dismiss_fingerprints(finding.get("req"), finding.get("principle"), finding["snippet"])
    stored = {k: v for k, v in finding.items() if k != "snippet"}
    assert keys.matches(**finding) is expected
    assert keys.matches_fingerprints(**stored, fingerprints=fps) is expected
