from quodeq.core.dismissals import DismissedKeys
from quodeq.core.map_history.snapshot import RunSnapshot, build_run_snapshot

V = lambda file, sev, req="R1", line=1, snippet="x()": {"req": req, "file": file, "severity": sev, "line": line, "snippet": snippet}


def _reports():
    return [
        ("security", {"violations": [V("a.py", "critical"), V("a.py", "minor", "R2", 3, "y()")], "compliance": [{"req": "R9", "file": "b.py", "line": 1}]}),
        ("maintainability", {"violations": [V("b.py", "major")], "compliance": []}),
        ("broken", ["not", "a", "dict"]),
    ]


def test_counts_weights_and_dims():
    snap = build_run_snapshot(_reports(), DismissedKeys())
    a, b = snap.files["a.py"], snap.files["b.py"]
    assert (a.critical, a.major, a.minor, a.compliance) == (1, 0, 1, 0)
    assert a.weight == 4.25
    assert (b.major, b.compliance) == (1, 1)
    assert snap.dims == ("maintainability", "security")


def test_dismissed_findings_do_not_count():
    dismissed = DismissedKeys.from_line_keys([("R1", "a.py", 1)])
    assert build_run_snapshot(_reports(), dismissed).files["a.py"].critical == 0


def test_round_trips_through_json():
    snap = build_run_snapshot(_reports(), DismissedKeys())
    assert RunSnapshot.from_json(snap.to_json()) == snap


def test_identities_are_per_dimension_and_stable():
    one = build_run_snapshot(_reports(), DismissedKeys()).files["a.py"].ids
    two = build_run_snapshot(_reports(), DismissedKeys()).files["a.py"].ids
    assert one == two and len(one) == 2
