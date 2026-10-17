import pytest

from quodeq.core.finding_identity import SuppressionSubject
from quodeq.core.map_history.raw_run import build_raw_run, materialise
from quodeq.core.map_history.selection import FindingSelection, SelectionError, select_run


def _subject(dim: str, v: dict) -> SuppressionSubject:
    file = str(v["file"])
    return SuppressionSubject(dim, str(v.get("req") or ""), str(v.get("principle") or ""), file, 1, (None,), file)


def _v(file: str, principle: str, sev: str = "major", req: str = "R1") -> dict:
    return {"req": req, "principle": principle, "file": file, "severity": sev, "line": 1, "snippet": req}


def _built():
    return build_raw_run([
        ("security", {"violations": [_v("a.py", "Auth"), _v("a.py", "Crypto", "critical", "R2"), _v("c.py", "Crypto")],
                      "compliance": [{"req": "R9", "file": "b.py"}, {"req": "R8", "file": "b.py"}]}),
        ("maintainability", {"violations": [_v("d.py", "Size", "minor")], "compliance": [{"req": "M1", "file": "a.py"}]}),
    ], _subject)


def _selected(dims, principle=""):
    built = _built()
    return materialise(select_run(built.run, built.records, FindingSelection(frozenset(dims), principle)),
                       built.records, frozenset())


def test_one_dimension_keeps_its_findings_and_files_only():
    snap = _selected({"security"})
    assert sorted(snap.files) == ["a.py", "b.py", "c.py"] and snap.dims == ("security",)
    assert (snap.files["a.py"].critical, snap.files["a.py"].major, snap.files["a.py"].compliance) == (1, 1, 0)
    assert snap.files["b.py"].compliance == 2


def test_several_dimensions_keep_each_ones_findings():
    snap = _selected({"security", "maintainability"})
    assert sorted(snap.files) == ["a.py", "b.py", "c.py", "d.py"]
    assert snap.files["a.py"].compliance == 1 and snap.files["d.py"].minor == 1


def test_every_dimension_selected_is_the_unselected_snapshot():
    built = _built()
    assert _selected({"security", "maintainability"}) == materialise(built.run, built.records, frozenset())


def test_a_principle_keeps_its_violations_over_every_file_its_dimension_checked():
    snap = _selected({"security"}, "Crypto")
    assert sorted(snap.files) == ["a.py", "b.py", "c.py"]
    assert (snap.files["a.py"].critical, snap.files["a.py"].major) == (1, 0)
    assert snap.files["b.py"].violations == 0 and snap.files["b.py"].weight == 0


def test_a_principle_counts_no_compliance():
    assert {s.compliance for s in _selected({"security"}, "Crypto").files.values()} == {0}


@pytest.mark.parametrize("dims, principle", [((), ""), ((), "Auth"), (("security", "maintainability"), "Auth")])
def test_a_selection_that_cannot_be_measured_is_refused(dims, principle):
    with pytest.raises(SelectionError):
        FindingSelection(frozenset(dims), principle)


def test_unknown_dimensions_are_named():
    with pytest.raises(SelectionError, match="perf, ux"):
        FindingSelection(frozenset({"ux", "perf", "security"})).check_known({"security"})


def test_a_file_whose_dimension_findings_are_all_hidden_is_not_checked_under_a_principle():
    built = _built()
    hidden = frozenset(built.run.files["c.py"].violations)
    selected = select_run(built.run, built.records, FindingSelection(frozenset({"security"}), "Auth"), hidden)
    assert "c.py" not in materialise(selected, built.records, hidden).files
