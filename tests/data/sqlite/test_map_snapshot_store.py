import sqlite3

from quodeq.data.sqlite.score_cache_schema import SCHEMA
from quodeq.data.sqlite.score_cache_store import load_map_snapshots, prune_map_snapshots, store_map_snapshot


def _conn():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    return conn


def test_store_load_respects_key_and_prune():
    conn = _conn()
    store_map_snapshot(conn, "p", "r1", "k1", {"dims": ["sec"], "files": {}})
    store_map_snapshot(conn, "p", "r2", "k2", {"dims": [], "files": {}})
    assert load_map_snapshots(conn, "p", {"r1": "k1", "r2": "stale"}) == {"r1": {"dims": ["sec"], "files": {}}}
    prune_map_snapshots(conn, "p", {"r1"})
    assert load_map_snapshots(conn, "p", {"r1": "k1", "r2": "k2"}).keys() == {"r1"}
