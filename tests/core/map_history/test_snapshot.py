from quodeq.core.map_history.snapshot import build_run_snapshot, finding_dimension, is_violation


def _violation(file: str, sev: str, req: str = "R1", line: int = 1, snippet: str = "x()") -> dict:
    return {"req": req, "file": file, "severity": sev, "line": line, "snippet": snippet}


def _never(_dim: str, _violation: dict) -> bool:
    return False


def _reports():
    return [
        ("security", {"violations": [_violation("a.py", "critical"), _violation("a.py", "minor", "R2", 3, "y()")], "compliance": [{"req": "R9", "file": "b.py", "line": 1}]}),
        ("maintainability", {"violations": [_violation("b.py", "major")], "compliance": []}),
        ("broken", ["not", "a", "dict"]),
    ]


def test_violations_count_per_severity_and_compliance_per_file():
    snap = build_run_snapshot(_reports(), _never)
    a, b = snap.files["a.py"], snap.files["b.py"]
    assert (a.critical, a.major, a.minor, a.compliance) == (1, 0, 1, 0)
    assert (b.major, b.compliance) == (1, 1)


def test_a_files_weight_sums_its_violations_severity_weights():
    assert build_run_snapshot(_reports(), _never).files["a.py"].weight == 4.25


def test_dims_are_the_dimensions_with_a_readable_report():
    assert build_run_snapshot(_reports(), _never).dims == ("maintainability", "security")


def test_a_dimension_with_a_colon_keeps_its_identity_fields():
    snap = build_run_snapshot([("org:sec", {"violations": [_violation("a.py", "major")]})], _never)
    (fid,) = snap.files["a.py"].ids
    assert finding_dimension(fid) == "org:sec" and is_violation(fid)


def test_hidden_findings_do_not_count():
    seen = []

    def hidden(dim: str, violation: dict) -> bool:
        seen.append((dim, violation["req"]))
        return violation["req"] == "R1"
    snap = build_run_snapshot(_reports(), hidden)
    assert (snap.files["a.py"].critical, snap.files["a.py"].minor) == (0, 1)
    assert ("security", "R1") in seen and ("maintainability", "R1") in seen


def test_identities_are_per_dimension_and_stable():
    one = build_run_snapshot(_reports(), _never).files["a.py"].ids
    two = build_run_snapshot(_reports(), _never).files["a.py"].ids
    assert one == two and len(one) == 2


def test_non_dict_entries_in_a_reports_lists_are_skipped():
    reports = [("security", {"violations": ["oops", None, _violation("a.py", "major")], "compliance": [3, {"file": "b.py"}]})]
    snap = build_run_snapshot(reports, _never)
    assert (snap.files["a.py"].major, snap.files["b.py"].compliance) == (1, 1)


def test_weights_come_from_the_caller():
    snap = build_run_snapshot(_reports(), _never, {"critical": 10.0, "major": 1.0, "minor": 0.5})
    assert snap.files["a.py"].weight == 10.5


def test_a_non_string_severity_counts_as_minor():
    reports = [("security", {"violations": [{**_violation("a.py", "major"), "severity": ["major"]},
                                            {**_violation("b.py", "major"), "severity": {"x": 1}}]})]
    snap = build_run_snapshot(reports, _never)
    assert (snap.files["a.py"].minor, snap.files["b.py"].minor) == (1, 1)
