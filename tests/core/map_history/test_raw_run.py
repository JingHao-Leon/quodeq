import pytest

from quodeq.core.finding_identity import SuppressionSubject
from quodeq.core.map_history.raw_run import RawRun, build_raw_run, materialise, record_key, referenced_records
from quodeq.core.map_history.snapshot import COMPLIANCE, VIOLATION, finding_dimension, finding_id, is_violation


def _subject(dim: str, v: dict) -> SuppressionSubject:
    file = str(v["file"])
    return SuppressionSubject(dim, str(v.get("req") or ""), "", file, int(v.get("line") or 0), (None,), file)


def _violation(file: str, sev: object, req: str = "R1", line: int = 1, snippet: str = "x()") -> dict:
    return {"req": req, "file": file, "severity": sev, "line": line, "snippet": snippet}


def _reports():
    return [
        ("security", {"violations": [_violation("a.py", "critical"), _violation("a.py", "minor", "R2", 3, "y()")],
                      "compliance": [{"req": "R9", "file": "b.py", "line": 1}]}),
        ("maintainability", {"violations": [_violation("b.py", "major")], "compliance": []}),
        ("broken", ["not", "a", "dict"]),
    ]


def _snapshot(reports=None, hidden=frozenset(), weights=None):
    built = build_raw_run(reports if reports is not None else _reports(), _subject)
    if weights is None:
        return materialise(built.run, built.records, hidden)
    return materialise(built.run, built.records, hidden, weights)


def test_violations_count_per_severity_and_compliance_per_file():
    snap = _snapshot()
    a, b = snap.files["a.py"], snap.files["b.py"]
    assert (a.critical, a.major, a.minor, a.compliance) == (1, 0, 1, 0)
    assert (b.major, b.compliance) == (1, 1)


def test_weights_are_applied_when_materialised():
    assert _snapshot().files["a.py"].weight == 4.25
    assert _snapshot(weights={"critical": 10.0, "major": 1.0, "minor": 0.5}).files["a.py"].weight == 10.5


def test_dims_are_the_dimensions_with_a_readable_report():
    assert _snapshot().dims == ("maintainability", "security")


def test_hidden_records_do_not_count_and_a_file_left_empty_is_gone():
    built = build_raw_run(_reports(), _subject)
    hidden = {k for k, r in built.records.items() if r.subject.req == "R1"}
    snap = materialise(built.run, built.records, hidden)
    assert (snap.files["a.py"].critical, snap.files["a.py"].minor) == (0, 1)
    assert (snap.files["b.py"].major, snap.files["b.py"].compliance) == (0, 1)
    only_hidden = build_raw_run([("sec", {"violations": [_violation("c.py", "major")]})], _subject)
    assert materialise(only_hidden.run, only_hidden.records, set(only_hidden.records)).files == {}


def test_ids_are_the_shape_2_finding_identities_plus_compliance_marks():
    snap = _snapshot()
    ids = snap.files["a.py"].ids
    assert ids == {finding_id("security", VIOLATION, _violation("a.py", "critical")),
                   finding_id("security", VIOLATION, _violation("a.py", "minor", "R2", 3, "y()"))}
    (mark,) = [i for i in snap.files["b.py"].ids if not is_violation(i)]
    assert finding_dimension(mark) == "security" and mark.split(":")[1] == COMPLIANCE


def test_a_compliance_mark_changes_only_when_the_dimensions_judgments_change():
    one = build_raw_run(_reports(), _subject).run.files["b.py"].marks
    same = build_raw_run(_reports(), _subject).run.files["b.py"].marks
    changed = build_raw_run([("security", {"compliance": [{"req": "R8", "file": "b.py", "line": 1}]})], _subject)
    assert one == same and one != changed.run.files["b.py"].marks


def test_a_repeated_finding_counts_twice_under_one_record():
    built = build_raw_run([("sec", {"violations": [_violation("a.py", "major"), _violation("a.py", "major")]})], _subject)
    assert len(built.records) == 1 and len(built.run.files["a.py"].violations) == 2
    assert materialise(built.run, built.records, set()).files["a.py"].major == 2


def test_non_dict_entries_and_non_string_severities():
    reports = [("security", {"violations": ["oops", None, {**_violation("a.py", "major"), "severity": ["major"]}],
                             "compliance": [3, {"file": "b.py"}]})]
    snap = _snapshot(reports)
    assert (snap.files["a.py"].minor, snap.files["b.py"].compliance) == (1, 1)


def test_record_keys_are_content_keys_and_runs_are_read_only():
    built = build_raw_run(_reports(), _subject)
    assert all(record_key(r) == k for k, r in built.records.items())
    assert referenced_records([built.run]) == set(built.records)
    with pytest.raises(TypeError):
        built.run.files["new.py"] = built.run.files["a.py"]
    assert isinstance(built.run, RawRun)


def test_compliance_is_kept_per_dimension_aligned_with_the_marks():
    judged = [{"req": "R8", "file": "b.py", "line": 1}, {"req": "R9", "file": "b.py", "line": 2}]
    reports = [("security", {"compliance": judged}),
               ("maintainability", {"compliance": [{"req": "M1", "file": "b.py", "line": 1}]})]
    raw = build_raw_run(reports, _subject).run.files["b.py"]
    per_dim = {finding_dimension(m): n for m, n in zip(raw.marks, raw.compliance, strict=True)}
    assert per_dim == {"security": 2, "maintainability": 1}
    assert materialise(build_raw_run(reports, _subject).run, {}, set()).files["b.py"].compliance == 3
