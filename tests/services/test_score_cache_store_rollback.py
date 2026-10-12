"""A failed score-cache write leaves the connection clean.

``write_cached_rows`` deletes the run's rows before inserting the new ones.
When the insert fails, the delete must be rolled back: the connection is a
session's, shared by the next write, which would otherwise commit the
delete and lose the rows the cache still had."""
from __future__ import annotations

import sqlite3

from quodeq.core.types import DimensionResult
from quodeq.data.sqlite import score_cache_store
from quodeq.services.score_cache import open_score_cache, read_cached_rows, write_cached_rows


def _boom(*_args, **_kwargs):
    raise sqlite3.OperationalError("disk I/O error")


def test_failed_write_rolls_back_the_delete(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "sc.db"))
    dims = [DimensionResult(dimension="security", overall_score="8.5/10", overall_grade="Good")]
    with open_score_cache() as conn:
        write_cached_rows(conn, "proj", "r1", "v1", dims)
        monkeypatch.setattr(score_cache_store, "write_principle_rows", _boom)
        write_cached_rows(conn, "proj", "r1", "v2", dims)  # fails after the DELETE
        assert conn.in_transaction is False
        assert read_cached_rows(conn, "proj", "r1", "v1") is not None
    with open_score_cache() as conn:
        assert read_cached_rows(conn, "proj", "r1", "v1") is not None
        assert read_cached_rows(conn, "proj", "r1", "v2") is None
