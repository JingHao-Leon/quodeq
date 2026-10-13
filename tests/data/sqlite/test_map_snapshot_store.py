import logging
import sqlite3

from quodeq.core.finding_identity import SuppressionSubject
from quodeq.core.map_history.raw_run import RawFile, RawHistory, RawHistoryWrite, RawRun, ViolationRecord, record_key
from quodeq.data.sqlite import score_cache_map_snapshot
from quodeq.data.sqlite.score_cache_db import open_score_cache
from quodeq.data.sqlite.score_cache_run_payloads import MAP_SNAPSHOT, store_run_payloads
from quodeq.data.sqlite.score_cache_store import load_map_snapshots, save_map_snapshots

REC = ViolationRecord(SuppressionSubject("sec", "R1", "P", "a.py", 3, ("f" * 64,), "a.py"), "major", "sec:v:0123456789ab")
ODD = ViolationRecord(SuppressionSubject("sec", "", "P", "b.py", 0, (None, "e" * 64), "b.py:tail"), "", "sec:v:ba9876543210")
K, KO = record_key(REC), record_key(ODD)
RUN = RawRun(("sec",), {"a.py": RawFile((K, K), 2, ("sec:c:aaaaaaaaaaaa",)), "b.py": RawFile((KO,))})
EMPTY = RawRun((), {})


def _env(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))


def _save(runs, keep_runs, keep_records=frozenset({K, KO}), records=None):
    save_map_snapshots("p", RawHistoryWrite(runs, {K: REC, KO: ODD} if records is None else records,
                                            set(keep_runs), set(keep_records)))


def test_runs_and_records_round_trip_and_respect_the_key(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k1", RUN), "r2": ("k2", EMPTY)}, {"r1", "r2"})
    got = load_map_snapshots("p", {"r1": "k1", "r2": "stale"})
    assert got == RawHistory({"r1": RUN}, {K: REC, KO: ODD})


def test_a_run_whose_record_is_missing_reads_as_a_miss(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN)}, {"r1"}, keep_records={K}, records={K: REC})
    assert load_map_snapshots("p", {"r1": "k"}).runs == {}


def test_a_run_whose_record_row_does_not_decode_reads_as_a_miss(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN), "r2": ("k", EMPTY)}, {"r1", "r2"})
    with open_score_cache() as conn:
        conn.execute("UPDATE map_finding SET payload=? WHERE project='p' AND rec=?", ("[1, 2", KO))
        conn.commit()
    got = load_map_snapshots("p", {"r1": "k", "r2": "k"})
    assert got.runs == {"r2": EMPTY} and got.records == {K: REC}


def test_runs_and_records_outside_the_keep_sets_are_dropped(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN), "r2": ("k", EMPTY)}, {"r1", "r2"})
    _save({}, {"r2"}, keep_records=set(), records={})
    got = load_map_snapshots("p", {"r1": "k", "r2": "k"})
    assert got.runs.keys() == {"r2"} and got.records == {}


def test_rows_of_the_previous_shape_read_as_misses(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    old = {"dims": ["sec"], "files": {"a.py": [1, 2, 3, 4, 5.5, ["sec:v:1"], ["sec"]]}}
    with open_score_cache() as conn:
        store_run_payloads(conn, MAP_SNAPSHOT, "p", {"r1": ("3|sec", old), "r2": ("3|sec", {"nope": 1})})
    assert load_map_snapshots("p", {"r1": "3|sec", "r2": "3|sec"}).runs == {}


def test_a_cache_of_the_previous_release_reads_as_misses_without_finding_rows(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    old = {"dims": ["sec"], "files": {"a.py": [1, 2, 3, 4, 5.5, ["sec:v:1"], ["sec"]]}}
    with open_score_cache() as conn:
        conn.execute("DROP TABLE map_finding")
        store_run_payloads(conn, MAP_SNAPSHOT, "p", {"r1": ("k", old)})
    assert load_map_snapshots("p", {"r1": "k"}) == RawHistory({}, {})


def test_run_payloads_are_stored_compressed(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN)}, {"r1"})
    with open_score_cache() as conn:
        (payload,) = conn.execute("SELECT payload FROM map_snapshot WHERE project='p'").fetchone()
    assert isinstance(payload, bytes)


def test_a_fresh_save_commits_records_then_runs(tmp_path, monkeypatch):
    from quodeq.data.sqlite.score_cache_db import score_cache_session
    _env(tmp_path, monkeypatch)
    commits = []
    with score_cache_session():
        with open_score_cache() as conn:  # inside a session every open yields this one connection
            conn.set_trace_callback(lambda sql: commits.append(sql) if sql.strip().upper() == "COMMIT" else None)
        _save({f"r{i}": ("k", RUN) for i in range(5)}, {f"r{i}" for i in range(5)})
    assert len(commits) == 2


def test_an_unavailable_cache_reads_empty_and_writes_nothing(monkeypatch, caplog):
    def broken():
        raise sqlite3.OperationalError("unable to open database file")
    monkeypatch.setattr(score_cache_map_snapshot, "open_score_cache", broken)
    with caplog.at_level(logging.WARNING):
        assert load_map_snapshots("p", {"r1": "k"}) == RawHistory({}, {})
        _save({"r1": ("k", EMPTY)}, {"r1"})
    assert len(caplog.records) == 2


def test_a_corrupt_record_row_is_rewritten_by_the_next_save(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN)}, {"r1"})
    with open_score_cache() as conn:
        conn.execute("UPDATE map_finding SET payload=? WHERE project='p' AND rec=?", ("[1, 2", KO))
        conn.commit()
    assert load_map_snapshots("p", {"r1": "k"}).runs == {}
    _save({"r1": ("k", RUN)}, {"r1"})
    assert load_map_snapshots("p", {"r1": "k"}) == RawHistory({"r1": RUN}, {K: REC, KO: ODD})


def test_a_run_with_a_non_text_record_key_reads_as_a_miss(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({}, set())
    bad = {"dims": [], "files": {"a": [0, [[1]], []]}}
    worse = {"dims": [], "files": {"a": [0, [], [3]]}}
    with open_score_cache() as conn:
        store_run_payloads(conn, MAP_SNAPSHOT, "p", {"r1": ("k", bad), "r2": ("k", worse)})
    assert load_map_snapshots("p", {"r1": "k", "r2": "k"}).runs == {}
