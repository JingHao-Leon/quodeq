import pytest

from quodeq.core.map_history.snapshot import (
    COMPLIANCE, VIOLATION, FileStat, RunSnapshot, compliance_mark, finding_dimension, finding_id, ids_in_dims, is_violation)


def test_a_dimension_with_a_colon_keeps_its_identity_fields():
    fid = finding_id("org:sec", VIOLATION, {"req": "R1", "file": "a.py", "line": 1, "snippet": "x()"})
    assert finding_dimension(fid) == "org:sec" and is_violation(fid)


def test_identities_are_stable_and_per_dimension():
    v = {"req": "R1", "file": "a.py", "line": 1, "snippet": "x()"}
    assert finding_id("sec", VIOLATION, v) == finding_id("sec", VIOLATION, v)
    assert finding_id("sec", VIOLATION, v) != finding_id("perf", VIOLATION, v)


def test_a_compliance_mark_is_order_free_and_not_a_violation():
    a, b = {"req": "R1", "file": "a.py", "line": 1}, {"req": "R2", "file": "a.py", "line": 2}
    assert compliance_mark("sec", [a, b]) == compliance_mark("sec", [b, a])
    assert not is_violation(compliance_mark("sec", [a])) and compliance_mark("sec", [a]).split(":")[1] == COMPLIANCE


def test_ids_in_dims_keeps_only_the_asked_dimensions():
    ids = {"sec:v:1", "perf:v:2"}
    assert ids_in_dims(ids, {"sec"}) == {"sec:v:1"}


def test_a_snapshots_files_cannot_be_changed():
    snap = RunSnapshot(("sec",), {"a.py": FileStat(major=1)})
    with pytest.raises(TypeError):
        snap.files["new.py"] = snap.files["a.py"]


def test_a_repeated_compliance_judgment_does_not_change_the_mark():
    a = {"req": "R1", "file": "a.py", "line": 1}
    assert compliance_mark("sec", [a, a]) == compliance_mark("sec", [a])
