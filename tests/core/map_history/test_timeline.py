from collections import Counter

from quodeq.core.map_history.snapshot import FileStat, RunSnapshot
from quodeq.core.map_history.timeline import finding_flows, running_edits, violation_ages, violation_ids


def _snapshot(**files: set[str]) -> RunSnapshot:
    return RunSnapshot(("sec",), {p: FileStat(ids=frozenset(ids)) for p, ids in files.items()})


def test_violation_ids_leave_out_compliance():
    assert violation_ids(_snapshot(**{"a.py": {"sec:v:1", "sec:c:2"}})) == {"sec:v:1"}


def test_running_edits_add_up_every_transition():
    got = running_edits([Counter(), Counter({"a": 1}), Counter({"a": 2, "b": 1})])
    assert got == [Counter(), Counter({"a": 1}), Counter({"a": 3, "b": 1})]


def test_age_counts_from_the_start_of_the_unbroken_chain():
    snaps = [_snapshot(**{"a.py": {"sec:v:x"}}), _snapshot(**{"a.py": {"sec:v:x", "sec:c:y"}, "b.py": {"sec:c:y"}})]
    ages = violation_ages(snaps, ["2026-09-01", "2026-09-08"], [violation_ids(s) for s in snaps])
    assert ages == [{"a.py": 0}, {"a.py": 7, "b.py": 0}]


def test_flows_count_new_and_fixed_against_the_run_before():
    violations = [{"v1", "v2"}, {"v2", "v3", "v4"}]
    assert finding_flows(violations, [1]) == {1: (2, 1)}
    assert finding_flows(violations, [0, 1]) == {0: (0, 0), 1: (2, 1)}
