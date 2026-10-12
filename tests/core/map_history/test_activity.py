from quodeq.core.map_history.activity import estimate_edits, first_seen_index
from quodeq.core.map_history.snapshot import FileStat, RunSnapshot


def _snapshot(dims, **files):
    """A snapshot whose files each carry one major violation per given id."""
    # ids are written short here; real ones are "<dimension>:<verdict>:<hash>" (see the snapshot module)
    return RunSnapshot(tuple(dims), {p: FileStat(major=1, ids=frozenset(f"{dims[0]}:v:{i}" for i in ids), dims=frozenset(dims))
                                     for p, ids in files.items()})


def test_changed_and_new_files_are_edits():
    stable = {f"s{i}.py": {f"s{i}"} for i in range(6)}
    prev = _snapshot(["sec"], **{"a.py": {"x"}, "b.py": {"y"}}, **stable)
    cur = _snapshot(["sec"], **{"a.py": {"x"}, "b.py": {"z"}, "c.py": {"w"}}, **stable)
    assert estimate_edits(prev, cur) == {"b.py", "c.py"}


def test_renamed_file_old_path_is_not_an_edit():
    stable = {f"s{i}.py": {f"s{i}"} for i in range(6)}
    prev = _snapshot(["sec"], **{"old.py": {"x"}, "keep.py": {"k"}}, **stable)
    cur = _snapshot(["sec"], **{"new.py": {"x"}, "keep.py": {"k"}}, **stable)
    assert estimate_edits(prev, cur) == {"new.py"}


def test_only_shared_dimensions_are_compared():
    prev = RunSnapshot(("sec",), {"a.py": FileStat(ids=frozenset({"sec:v:x"}), dims=frozenset({"sec"}))})
    cur = RunSnapshot(("acc", "sec"), {"a.py": FileStat(ids=frozenset({"sec:v:x", "acc:v:new"}), dims=frozenset({"sec", "acc"}))})
    assert estimate_edits(prev, cur) == set()   # the new dimension's finding is not an edit


def test_cache_reset_contributes_no_edits():
    prev = _snapshot(["sec"], **{f"f{i}.py": {f"a{i}"} for i in range(10)})
    cur = _snapshot(["sec"], **{f"f{i}.py": {f"b{i}"} for i in range(10)})
    assert estimate_edits(prev, cur) == set()


def test_first_seen_follows_unbroken_chains():
    runs = [_snapshot(["sec"], **{"a.py": {"x"}}), _snapshot(["sec"], **{"a.py": {"x", "y"}}), _snapshot(["sec"], **{"a.py": {"y"}})]
    seen = first_seen_index(runs)
    assert seen[2] == {"sec:v:y": 1}


def test_new_file_with_only_new_dimension_findings_is_not_an_edit():
    stable = {f"s{i}.py": {f"s{i}"} for i in range(6)}
    prev = _snapshot(["sec"], **stable)
    cur_files = {p: FileStat(major=1, ids=frozenset(f"sec:v:{i}" for i in ids), dims=frozenset({"sec"})) for p, ids in stable.items()}
    cur_files["b.py"] = FileStat(ids=frozenset({"acc:v:n"}), dims=frozenset({"acc"}))
    cur = RunSnapshot(("acc", "sec"), cur_files)
    assert estimate_edits(prev, cur) == set()


def test_exactly_sixty_percent_edited_still_counts():
    prev = _snapshot(["sec"], **{f"f{i}.py": {f"a{i}"} for i in range(10)})
    cur = _snapshot(["sec"], **{f"f{i}.py": {f"b{i}" if i < 6 else f"a{i}"} for i in range(10)})
    assert estimate_edits(prev, cur) == {f"f{i}.py" for i in range(6)}


def test_first_seen_restarts_after_a_gap():
    runs = [_snapshot(["sec"], **{"a.py": {"x"}}), _snapshot(["sec"], **{"a.py": {"y"}}), _snapshot(["sec"], **{"a.py": {"x"}})]
    assert first_seen_index(runs)[2]["sec:v:x"] == 2
