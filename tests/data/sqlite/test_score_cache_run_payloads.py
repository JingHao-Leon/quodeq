import sqlite3

import pytest

from quodeq.data.sqlite.score_cache_run_payloads import (
    MAP_SNAPSHOT, RUN_CHANGE, RunPayloadTable, load_run_payloads, store_run_payloads,
)
from quodeq.data.sqlite.score_cache_schema import SCHEMA


def test_only_allow_listed_tables_can_be_named():
    with pytest.raises(ValueError):
        RunPayloadTable("findings; DROP TABLE run_change")


def test_each_table_keeps_its_serialisation():
    assert (RUN_CHANGE.table, RUN_CHANGE.separators) == ("run_change", None)
    assert (MAP_SNAPSHOT.table, MAP_SNAPSHOT.separators) == ("map_snapshot", (",", ":"))


def _conn():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    return conn


def test_loads_only_the_asked_runs_across_chunks():
    conn = _conn()
    store_run_payloads(conn, MAP_SNAPSHOT, "p", {f"r{i}": ("k", {"i": i}) for i in range(1200)})
    got = load_run_payloads(conn, MAP_SNAPSHOT, "p", {f"r{i}": "k" for i in range(0, 1200, 2)})
    assert len(got) == 600 and got["r1198"] == {"i": 1198}


def test_an_unserialisable_payload_is_skipped_and_the_rest_stored():
    conn = _conn()
    store_run_payloads(conn, RUN_CHANGE, "p", {"bad": ("k", {"x": object()}), "good": ("k", {"x": 1})})
    assert load_run_payloads(conn, RUN_CHANGE, "p", {"bad": "k", "good": "k"}) == {"good": {"x": 1}}
