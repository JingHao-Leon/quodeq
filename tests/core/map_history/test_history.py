from collections import Counter

from quodeq.core.map_history.history import FileRow, RunActivity, assemble_history
from quodeq.core.map_history.snapshot import FileStat, RunSnapshot


def _snapshot(weight: float) -> RunSnapshot:
    return RunSnapshot(("sec",), {"x/a.py": FileStat(major=1, weight=weight, ids=frozenset({"sec:v:1"})),
                                  "x/tests/a_test.py": FileStat(compliance=1, ids=frozenset({"sec:c:2"}))})


def _history(frame_runs):
    activity = RunActivity("estimated", (Counter(), Counter({"x/a.py": 2})))
    return assemble_history(["2026-09-01", "2026-09-08"], [_snapshot(2.0), _snapshot(2.004)], activity, frame_runs)


def test_only_the_asked_frames_are_built():
    assert [f.day for f in _history([1]).frames] == ["2026-09-08"]
    assert [f.day for f in _history([0, 1]).frames] == ["2026-09-01", "2026-09-08"]


def test_rows_carry_running_edits_touch_and_age():
    history = _history([1])
    assert history.file_names == ("x/a.py", "x/tests/a_test.py")
    assert history.file_test == (False, True)
    rows = {r.file: r for r in history.frames[0].files}
    assert rows[0] == FileRow(0, 2.0, 1, 0, 0, 1, 2, True, 7)
    assert (rows[1].touched, rows[1].age_days) == (False, 0)
