from quodeq.core.map_history.activity import estimate_edits, first_seen_index
from quodeq.core.map_history.snapshot import FileStat, RunSnapshot


def S(dims, **files):
    # ids are written short here; real ones are "<dimension>:<verdict>:<hash>" (see the snapshot module)
    return RunSnapshot(tuple(dims), {p: FileStat(major=1, ids=frozenset(f"{dims[0]}:v:{i}" for i in ids), dims=frozenset(dims))
                                     for p, ids in files.items()})


def test_changed_and_new_files_are_edits():
    stable = {f"s{i}.py": {f"s{i}"} for i in range(6)}
    prev = S(["sec"], **{"a.py": {"x"}, "b.py": {"y"}}, **stable)
    cur = S(["sec"], **{"a.py": {"x"}, "b.py": {"z"}, "c.py": {"w"}}, **stable)
    assert estimate_edits(prev, cur) == {"b.py", "c.py"}


def test_renamed_file_old_path_is_not_an_edit():
    stable = {f"s{i}.py": {f"s{i}"} for i in range(6)}
    prev = S(["sec"], **{"old.py": {"x"}, "keep.py": {"k"}}, **stable)
    cur = S(["sec"], **{"new.py": {"x"}, "keep.py": {"k"}}, **stable)
    assert estimate_edits(prev, cur) == {"new.py"}


def test_only_shared_dimensions_are_compared():
    prev = RunSnapshot(("sec",), {"a.py": FileStat(ids=frozenset({"sec:v:x"}), dims=frozenset({"sec"}))})
    cur = RunSnapshot(("acc", "sec"), {"a.py": FileStat(ids=frozenset({"sec:v:x", "acc:v:new"}), dims=frozenset({"sec", "acc"}))})
    assert estimate_edits(prev, cur) == set()   # the new dimension's finding is not an edit


def test_cache_reset_contributes_no_edits():
    prev = S(["sec"], **{f"f{i}.py": {f"a{i}"} for i in range(10)})
    cur = S(["sec"], **{f"f{i}.py": {f"b{i}"} for i in range(10)})
    assert estimate_edits(prev, cur) == set()


def test_first_seen_follows_unbroken_chains():
    runs = [S(["sec"], **{"a.py": {"x"}}), S(["sec"], **{"a.py": {"x", "y"}}), S(["sec"], **{"a.py": {"y"}})]
    seen = first_seen_index(runs)
    assert seen[2] == {"sec:v:y": 1}
