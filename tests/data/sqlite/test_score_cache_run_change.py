import pytest
from quodeq.data.sqlite.score_cache_db import open_score_cache
from quodeq.data.sqlite.score_cache_store import load_run_changes, prune_run_changes, store_run_change


@pytest.fixture(autouse=True)
def _iso(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "sc.db"))


def test_a_stored_change_is_served_only_for_the_same_key() -> None:
    with open_score_cache() as conn:
        store_run_change(conn, "p", "r1", "v1|b0", {"counts": {"new": 3}})
        assert load_run_changes(conn, "p", {"r1": "v1|b0"}) == {"r1": {"counts": {"new": 3}}}
        assert load_run_changes(conn, "p", {"r1": "v2|b0"}) == {}


def test_a_new_key_replaces_the_old_row() -> None:
    with open_score_cache() as conn:
        store_run_change(conn, "p", "r1", "v1|b0", {"counts": {"new": 3}})
        store_run_change(conn, "p", "r1", "v2|b9", {"counts": {"new": 4}})
        assert load_run_changes(conn, "p", {"r1": "v2|b9"}) == {"r1": {"counts": {"new": 4}}}


def test_prune_drops_the_rows_of_runs_no_longer_listed() -> None:
    with open_score_cache() as conn:
        store_run_change(conn, "p", "r1", "k", {"counts": None})
        store_run_change(conn, "p", "gone", "k", {"counts": None})
        store_run_change(conn, "other", "gone", "k", {"counts": None})
        prune_run_changes(conn, "p", {"r1"})
        assert load_run_changes(conn, "p", {"r1": "k", "gone": "k"}) == {"r1": {"counts": None}}
        assert load_run_changes(conn, "other", {"gone": "k"}) == {"gone": {"counts": None}}
