from collections import Counter

from quodeq.core.map_history.snapshot import FileStat, RunSnapshot
from quodeq.core.map_history.timeline import (
    finding_flows,
    full_run_dimensions,
    running_edits,
    violation_ages,
    violation_ids,
)


def _snapshot(dims: tuple[str, ...] = ("sec",), **files: set[str]) -> RunSnapshot:
    return RunSnapshot(dims, {p: FileStat(ids=frozenset(ids)) for p, ids in files.items()})


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
    snaps = [_snapshot(), _snapshot()]
    violations = [{"sec:v:1", "sec:v:2"}, {"sec:v:2", "sec:v:3", "sec:v:4"}]
    assert finding_flows(snaps, violations, [1]) == {1: (2, 1)}
    assert finding_flows(snaps, violations, [0, 1]) == {0: (0, 0), 1: (2, 1)}


def test_flows_leave_out_a_dimension_one_of_the_runs_did_not_run():
    full, short = _snapshot(("mnt", "sec")), _snapshot(("sec",))
    snaps = [full, short, full]
    violations = [{"sec:v:1", "mnt:v:2"}, {"sec:v:1"}, {"sec:v:1", "mnt:v:2", "mnt:v:3"}]
    assert finding_flows(snaps, violations, [1, 2]) == {1: (0, 0), 2: (0, 0)}


def test_age_survives_a_run_that_skipped_the_dimension():
    days = ["2026-09-01", "2026-09-02", "2026-09-03"]
    snaps = [_snapshot(("mnt", "sec"), **{"a.py": {"mnt:v:x"}}), _snapshot(("sec",), **{"b.py": {"sec:v:y"}}),
             _snapshot(("mnt", "sec"), **{"a.py": {"mnt:v:x"}})]
    assert violation_ages(snaps, days, [violation_ids(s) for s in snaps])[2]["a.py"] == 2


def test_a_full_run_has_the_usual_dimension_count_less_one():
    assert full_run_dimensions([6, 6, 5, 2]) == 5


def test_a_full_run_needs_at_least_one_dimension():
    assert full_run_dimensions([1, 1]) == 1
