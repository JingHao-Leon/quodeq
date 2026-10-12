import logging
import sqlite3

from quodeq.core.map_history.snapshot import FileStat, RunSnapshot
from quodeq.data.sqlite import score_cache_map_snapshot
from quodeq.data.sqlite.score_cache_db import open_score_cache
from quodeq.data.sqlite.score_cache_run_payloads import MAP_SNAPSHOT, store_run_payloads
from quodeq.data.sqlite.score_cache_store import load_map_snapshots, save_map_snapshots

SEC = RunSnapshot(("sec",), {"a.py": FileStat(1, 2, 3, 4, 5.5, frozenset({"sec:v:1", "sec:c:2"}), frozenset({"sec"}))})
EMPTY = RunSnapshot((), {})


def test_save_load_respects_key_and_prune(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    save_map_snapshots("p", {"r1": ("k1", SEC), "r2": ("k2", EMPTY)}, {"r1", "r2"})
    assert load_map_snapshots("p", {"r1": "k1", "r2": "stale"}) == {"r1": SEC}
    save_map_snapshots("p", {}, {"r1"})
    assert load_map_snapshots("p", {"r1": "k1", "r2": "k2"}).keys() == {"r1"}


def test_a_row_in_another_layout_reads_as_a_miss(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    with open_score_cache() as conn:
        store_run_payloads(conn, MAP_SNAPSHOT, "p", {"r1": ("k", {"nope": 1}), "r2": ("k", {"dims": [], "files": {"a": [1]}})})
    assert load_map_snapshots("p", {"r1": "k", "r2": "k"}) == {}


def test_every_saved_snapshot_loads_back(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    save_map_snapshots("p", {f"r{i}": ("k", SEC) for i in range(5)}, {f"r{i}" for i in range(5)})
    assert load_map_snapshots("p", {f"r{i}": "k" for i in range(5)}) == {f"r{i}": SEC for i in range(5)}


def test_fresh_rows_are_stored_with_one_commit(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    commits = []
    real = score_cache_map_snapshot.store_run_payloads

    def spy(conn, *a):
        traced = conn.set_trace_callback(lambda sql: commits.append(sql) if sql.strip().upper() == "COMMIT" else None)
        real(conn, *a)
        conn.set_trace_callback(traced)
    monkeypatch.setattr(score_cache_map_snapshot, "store_run_payloads", spy)
    save_map_snapshots("p", {f"r{i}": ("k", SEC) for i in range(5)}, {f"r{i}" for i in range(5)})
    assert len(commits) == 1


def test_an_unavailable_cache_reads_empty_and_writes_nothing(monkeypatch, caplog):
    def broken():
        raise sqlite3.OperationalError("unable to open database file")
    monkeypatch.setattr(score_cache_map_snapshot, "open_score_cache", broken)
    with caplog.at_level(logging.WARNING):
        assert load_map_snapshots("p", {"r1": "k"}) == {}
        save_map_snapshots("p", {"r1": ("k", EMPTY)}, {"r1"})
    assert len(caplog.records) == 2
