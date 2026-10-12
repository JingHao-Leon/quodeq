from quodeq.core.map_history.git_log import Commit, commits_per_transition, parse_commit_log


def test_parses_each_commit_with_its_paths():
    out = "\x01100\0\na.py\0b.py\0\x01200\0\nc.py\0"
    assert parse_commit_log(out) == [Commit(100, ("a.py", "b.py")), Commit(200, ("c.py",))]


def test_commit_without_files_keeps_an_empty_list():
    assert parse_commit_log("\x01100\0\x01200\0\na.py\0") == [Commit(100, ()), Commit(200, ("a.py",))]


def test_non_ascii_and_newline_leading_paths_survive():
    out = "\x01100\0\n\nodd.py\0héllo.py\0"
    assert parse_commit_log(out) == [Commit(100, ("\nodd.py", "héllo.py"))]


def test_empty_log_has_no_commits():
    assert parse_commit_log("") == []


def test_commit_buckets_into_every_window_holding_it():
    starts, ends = [0, 10, 20], [5, 15, 25]
    commits = [Commit(-1, ("before",)), Commit(3, ("inside1",)), Commit(10, ("on_middle_start",)),
               Commit(15, ("on_middle_end",)), Commit(25, ("on_last_end",)), Commit(26, ("after",))]
    got = commits_per_transition(commits, starts, ends)
    assert got[0] == {}
    assert got[1] == {"inside1": 1, "on_middle_start": 1, "on_middle_end": 1}
    assert got[2] == {"on_middle_start": 1, "on_middle_end": 1, "on_last_end": 1}


def test_single_run_has_no_transitions():
    assert commits_per_transition([Commit(1, ("a",))], [0], [5]) == [{}]
