import json
import logging
import sqlite3

import pytest

from quodeq.core.finding_identity import SuppressionSubject
from quodeq.core.map_history.raw_run import RawFile, RawHistory, RawHistoryWrite, RawRun, ViolationRecord, record_key
from quodeq.data.sqlite import score_cache_map_snapshot
from quodeq.data.sqlite.score_cache_db import open_score_cache, score_cache_session
from quodeq.data.sqlite.score_cache_run_payloads import MAP_SNAPSHOT, store_run_payloads
from quodeq.data.sqlite.score_cache_store import load_map_snapshots, save_map_snapshots

REC = ViolationRecord(SuppressionSubject("sec", "R1", "P", "a.py", 3, ("f" * 64,), "a.py"), "major", "sec:v:0123456789ab")
ODD = ViolationRecord(SuppressionSubject("sec", "", "P", "b.py", 0, (None, "e" * 64), "b.py:tail"), "", "sec:v:ba9876543210")
K, KO = record_key(REC), record_key(ODD)
RUN = RawRun(("sec",), {"a.py": RawFile((K, K), (2,), ("sec:c:aaaaaaaaaaaa",)), "b.py": RawFile((KO,))})
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


def _set_record_payload(rec: str, text: str) -> None:
    """Overwrite the stored row of record *rec* with *text* (a garbled or foreign layout)."""
    with open_score_cache() as conn:
        conn.execute("UPDATE map_finding SET payload=? WHERE project='p' AND rec=?", (text, rec))
        conn.commit()


def _garble_record(rec: str, payload: list) -> None:
    _set_record_payload(rec, json.dumps(payload))


def test_a_run_whose_record_is_missing_reads_as_a_miss(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN)}, {"r1"}, keep_records={K}, records={K: REC})
    assert load_map_snapshots("p", {"r1": "k"}).runs == {}


def test_a_run_whose_record_row_does_not_decode_reads_as_a_miss(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN), "r2": ("k", EMPTY)}, {"r1", "r2"})
    _set_record_payload(KO, "[1, 2")
    got = load_map_snapshots("p", {"r1": "k", "r2": "k"})
    assert got.runs == {"r2": EMPTY} and got.records == {K: REC}


def test_runs_and_records_outside_the_keep_sets_are_dropped(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN), "r2": ("k", EMPTY)}, {"r1", "r2"})
    _save({}, {"r2"}, keep_records=set(), records={})
    got = load_map_snapshots("p", {"r1": "k", "r2": "k"})
    assert got.runs.keys() == {"r2"} and got.records == {}


def test_rows_of_the_previous_shapes_read_as_misses(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({}, set())
    two = {"dims": ["sec"], "files": {"a.py": [1, 2, 3, 4, 5.5, ["sec:v:1"], ["sec"]]}}
    three = {"dims": ["sec"], "files": {"a.py": [2, [K], ["sec:c:aaaaaaaaaaaa"]]}}
    with open_score_cache() as conn:
        store_run_payloads(conn, MAP_SNAPSHOT, "p", {"r1": ("k", two), "r2": ("k", {"nope": 1}), "r3": ("k", three)})
    assert load_map_snapshots("p", {"r1": "k", "r2": "k", "r3": "k"}).runs == {}


def test_a_run_whose_compliance_counts_do_not_match_its_marks_reads_as_a_miss(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({}, set())
    short = {"dims": ["sec"], "files": {"a.py": [[], [], ["sec:c:aaaaaaaaaaaa"]]}}
    text = {"dims": ["sec"], "files": {"a.py": [["2"], [], ["sec:c:aaaaaaaaaaaa"]]}}
    with open_score_cache() as conn:
        store_run_payloads(conn, MAP_SNAPSHOT, "p", {"r1": ("k", short), "r2": ("k", text)})
    assert load_map_snapshots("p", {"r1": "k", "r2": "k"}).runs == {}


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
    _set_record_payload(KO, "[1, 2")
    assert load_map_snapshots("p", {"r1": "k"}).runs == {}
    _save({"r1": ("k", RUN)}, {"r1"})
    assert load_map_snapshots("p", {"r1": "k"}) == RawHistory({"r1": RUN}, {K: REC, KO: ODD})


def test_a_run_with_a_non_text_record_key_reads_as_a_miss(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({}, set())
    bad = {"dims": [], "files": {"a": [[], [[1]], []]}}
    worse = {"dims": [], "files": {"a": [[1], [], [3]]}}
    with open_score_cache() as conn:
        store_run_payloads(conn, MAP_SNAPSHOT, "p", {"r1": ("k", bad), "r2": ("k", worse)})
    assert load_map_snapshots("p", {"r1": "k", "r2": "k"}).runs == {}


@pytest.mark.parametrize("fps", [[], "ffff", ["f" * 64, "f" * 64], [3]])
def test_a_record_with_the_wrong_fingerprints_reads_as_a_miss_and_heals(tmp_path, monkeypatch, fps):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN)}, {"r1"})
    _garble_record(K, ["sec", "R1", "P", "a.py", 3, fps, None, "major", "sec:v:0123456789ab"])
    assert load_map_snapshots("p", {"r1": "k"}).runs == {}
    _save({"r1": ("k", RUN)}, {"r1"})
    assert load_map_snapshots("p", {"r1": "k"}) == RawHistory({"r1": RUN}, {K: REC, KO: ODD})


@pytest.mark.parametrize("field", [0, 1, 2, 3, 6, 7, 8])
def test_a_record_with_a_non_text_field_reads_as_a_miss(tmp_path, monkeypatch, field):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN)}, {"r1"})
    payload = ["sec", "R1", "P", "a.py", 3, ["f" * 64], "a.py:x", "major", "sec:v:0123456789ab"]
    payload[field] = 7
    _garble_record(K, payload)
    assert load_map_snapshots("p", {"r1": "k"}).runs == {}


def test_a_warm_save_with_nothing_fresh_reads_no_record_row(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN)}, {"r1"})
    reads = []
    with score_cache_session():
        with open_score_cache() as conn:
            conn.set_trace_callback(lambda sql: reads.append(sql) if "payload FROM map_finding" in sql else None)
        _save({}, {"r1"}, records={})
    assert reads == []


def test_only_the_records_of_the_loaded_runs_are_read(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN), "r2": ("k", EMPTY)}, {"r1", "r2"})
    assert load_map_snapshots("p", {"r2": "k"}) == RawHistory({"r2": EMPTY}, {})


def test_a_fresh_save_reads_the_record_table_once(tmp_path, monkeypatch):
    _env(tmp_path, monkeypatch)
    _save({"r1": ("k", RUN)}, {"r1"})
    reads = []
    with score_cache_session():
        with open_score_cache() as conn:
            conn.set_trace_callback(lambda sql: reads.append(sql) if "FROM map_finding" in sql else None)
        _save({"r1": ("k", RUN)}, {"r1"})
    assert len(reads) == 1
