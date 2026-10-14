"""Principle counts persist in ``run_principle_scalars``; an older cache file still loads.

The trend's per-principle series is served from the score cache for finished
runs, so the counts travel with the principle rows. A cache file from before
the count columns gains them by migration, and its old rows read back with
the counts unknown (None), never as zeros, so no epoch bump is needed.
"""
from __future__ import annotations

import sqlite3

from quodeq.core.types import DimensionResult, PrincipleGrade
from quodeq.core.types.report import PrincipleCounts
from quodeq.services.score_cache import open_score_cache, read_cached_rows, write_cached_rows

_COUNTS = PrincipleCounts(violations=4, critical=1, major=2)


def _dim(counts: PrincipleCounts | None) -> DimensionResult:
    return DimensionResult(dimension="security", overall_score="7.0/10", overall_grade="Good",
                           principles=[PrincipleGrade("P1", "6.0/10", "Fair", counts=counts)])


def test_counts_round_trip(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "sc.db"))
    with open_score_cache() as conn:
        write_cached_rows(conn, "proj", "r1", "v1", [_dim(_COUNTS)])
        write_cached_rows(conn, "proj", "r2", "v1", [_dim(None)])
        (known,) = read_cached_rows(conn, "proj", "r1", "v1")
        (unknown,) = read_cached_rows(conn, "proj", "r2", "v1")
    assert known.principles[0].counts == _COUNTS
    assert unknown.principles[0].counts is None


def _legacy_cache(path) -> None:
    """A score-cache file whose principle table predates the count columns."""
    old = sqlite3.connect(path)
    old.executescript(
        "CREATE TABLE run_principle_scalars ("
        " project TEXT NOT NULL, run_id TEXT NOT NULL, version TEXT NOT NULL,"
        " dimension TEXT NOT NULL, principle TEXT NOT NULL, score TEXT, grade TEXT, confidence TEXT,"
        " PRIMARY KEY (project, run_id, dimension, principle, version));"
        "INSERT INTO run_principle_scalars (project, run_id, version, dimension, principle, score, grade)"
        " VALUES ('proj', 'r0', 'v0', 'security', 'P1', '6.0/10', 'Fair');"
    )
    old.commit()
    old.close()


def test_an_older_cache_file_gains_the_count_columns_and_its_rows_still_load(tmp_path, monkeypatch):
    path = tmp_path / "sc.db"
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(path))
    _legacy_cache(path)
    with open_score_cache() as conn:
        conn.execute("INSERT INTO run_scalars (project, run_id, version, dimension, overall_score, overall_grade)"
                     " VALUES ('proj', 'r0', 'v0', 'security', '7.0/10', 'Good')")
        conn.commit()
        (legacy,) = read_cached_rows(conn, "proj", "r0", "v0")
        write_cached_rows(conn, "proj", "r1", "v1", [_dim(_COUNTS)])
        (fresh,) = read_cached_rows(conn, "proj", "r1", "v1")
    assert legacy.principles == [PrincipleGrade("P1", "6.0/10", "Fair")]
    assert fresh.principles[0].counts == _COUNTS
