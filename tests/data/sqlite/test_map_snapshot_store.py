import logging
import sqlite3

from quodeq.data.sqlite import score_cache_map_snapshot
from quodeq.data.sqlite.score_cache_store import load_map_snapshot_payloads, save_map_snapshot_payloads


def test_save_load_respects_key_and_prune(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    save_map_snapshot_payloads("p", {"r1": ("k1", {"dims": ["sec"], "files": {}}), "r2": ("k2", {"dims": [], "files": {}})},
                               {"r1", "r2"})
    assert load_map_snapshot_payloads("p", {"r1": "k1", "r2": "stale"}) == {"r1": {"dims": ["sec"], "files": {}}}
    save_map_snapshot_payloads("p", {}, {"r1"})
    assert load_map_snapshot_payloads("p", {"r1": "k1", "r2": "k2"}).keys() == {"r1"}


def test_fresh_rows_are_stored_with_one_commit(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    commits = []
    real = score_cache_map_snapshot.store_run_payloads

    def spy(conn, *a):
        traced = conn.set_trace_callback(lambda sql: commits.append(sql) if sql.strip().upper() == "COMMIT" else None)
        real(conn, *a)
        conn.set_trace_callback(traced)
    monkeypatch.setattr(score_cache_map_snapshot, "store_run_payloads", spy)
    save_map_snapshot_payloads("p", {f"r{i}": ("k", {"i": i}) for i in range(5)}, {f"r{i}" for i in range(5)})
    assert len(commits) == 1
    assert len(load_map_snapshot_payloads("p", {f"r{i}": "k" for i in range(5)})) == 5


def test_an_unavailable_cache_reads_empty_and_writes_nothing(monkeypatch, caplog):
    def broken():
        raise sqlite3.OperationalError("unable to open database file")
    monkeypatch.setattr(score_cache_map_snapshot, "open_score_cache", broken)
    with caplog.at_level(logging.WARNING):
        assert load_map_snapshot_payloads("p", {"r1": "k"}) == {}
        save_map_snapshot_payloads("p", {"r1": ("k", {})}, {"r1"})
    assert len(caplog.records) == 2
