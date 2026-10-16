"""Connection-owning score-cache operations: round trips and error translation."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager

import pytest

from quodeq.data.sqlite import score_cache_access as access
from quodeq.data.sqlite.score_cache_access import ScoreCacheError
from quodeq.data.sqlite.score_cache_db import score_cache_path_override


@pytest.fixture()
def cache(tmp_path):
    with score_cache_path_override(tmp_path / "sc.db"):
        yield


def test_project_summary_round_trip(cache):
    assert access.read_project_summary("p", "v1") is None
    access.write_project_summary("p", "v1", {"score": 8.0})
    assert access.read_project_summary("p", "v1") == {"score": 8.0}


def test_run_changes_are_taken_and_others_pruned(cache):
    access.save_run_change("p", "r1", "k1", {"new": 1})
    access.save_run_change("p", "r2", "k2", {"new": 2})
    assert access.take_run_changes("p", {"r1": "k1"}) == {"r1": {"new": 1}}
    assert access.take_run_changes("p", {"r2": "k2"}) == {}


def test_run_key_store_round_trip(cache):
    keys = ({("R1", "a.py", 1)}, {("c",)})
    with access.run_key_store() as store:
        assert store.load("p", "r1") is None
        store.save("p", "r1", keys)
    assert access.persisted_run_key_sets("p", "r1") == keys


@pytest.mark.parametrize("error", [sqlite3.OperationalError("locked"), OSError("no dir")])
def test_open_failures_surface_as_score_cache_error(monkeypatch, error):
    @contextmanager
    def broken_open():
        raise error
        yield  # pragma: no cover

    monkeypatch.setattr(access, "open_score_cache", broken_open)
    with pytest.raises(ScoreCacheError):
        access.read_project_summary("p", "v1")
    assert access.persisted_run_key_sets("p", "r1") is None
    with access.run_key_store() as store:
        assert store.load("p", "r1") is None
        store.save("p", "r1", (set(), set()))  # no connection: nothing kept, nothing raised
