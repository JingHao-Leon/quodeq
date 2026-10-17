from collections import Counter

from quodeq.core.map_history.snapshot import FileStat, RunSnapshot
from quodeq.core.map_history.timeline import (
    NO_VIOLATION_START,
    ages_from_starts,
    finding_flows,
    running_edits,
    violation_age_starts,
    violation_counts,
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
    starts = violation_age_starts(snaps, [violation_ids(s) for s in snaps])
    assert starts == [{"a.py": 0}, {"a.py": 0, "b.py": NO_VIOLATION_START}]
    assert ages_from_starts(["2026-09-01", "2026-09-08"], starts) == [{"a.py": 0}, {"a.py": 7, "b.py": 0}]


def test_flows_count_new_and_fixed_against_the_run_before():
    snaps = [_snapshot(**{"a.py": {"sec:v:1", "sec:v:2"}}),
             _snapshot(**{"a.py": {"sec:v:2", "sec:v:3", "sec:c:9"}, "b.py": {"sec:v:4"}})]
    assert finding_flows(snaps, [violation_ids(x) for x in snaps], [1]) == {1: (2, 1)}
    assert finding_flows(snaps, [violation_ids(x) for x in snaps], [0, 1]) == {0: (0, 0), 1: (2, 1)}


def test_flows_count_a_dimensions_first_findings_as_new():
    snaps = [_snapshot(**{"a.py": {"sec:v:1"}}),
             _snapshot(("mnt", "sec"), **{"a.py": {"sec:v:1", "mnt:v:2", "mnt:v:3"}})]
    assert finding_flows(snaps, [violation_ids(x) for x in snaps], [1]) == {1: (2, 0)}


def test_flows_count_every_occurrence_of_a_repeated_violation():
    once = RunSnapshot(("sec",), {"a.py": FileStat(minor=1, ids=frozenset({"sec:v:1"}))})
    repeated = FileStat(minor=3, ids=frozenset({"sec:v:1"}), repeats=frozenset({("sec:v:1", 2)}))
    thrice = RunSnapshot(("sec",), {"a.py": repeated})
    assert violation_counts(thrice) == Counter({"sec:v:1": 3})
    snaps = [once, thrice, once]
    assert finding_flows(snaps, [violation_ids(x) for x in snaps], [1, 2]) == {1: (2, 0), 2: (0, 2)}


def test_age_survives_a_run_that_skipped_the_dimension():
    days = ["2026-09-01", "2026-09-02", "2026-09-03"]
    snaps = [_snapshot(("mnt", "sec"), **{"a.py": {"mnt:v:x"}}), _snapshot(("sec",), **{"b.py": {"sec:v:y"}}),
             _snapshot(("mnt", "sec"), **{"a.py": {"mnt:v:x"}})]
    starts = violation_age_starts(snaps, [violation_ids(s) for s in snaps])
    assert starts[2]["a.py"] == 0 and ages_from_starts(days, starts)[2]["a.py"] == 2
