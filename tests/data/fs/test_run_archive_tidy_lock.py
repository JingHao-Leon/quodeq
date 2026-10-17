"""Tidy leaves no lock file on a run it has no database work for, so readers keep the lock-free open."""
from __future__ import annotations

import sqlite3

from quodeq.data.fs.run_archive import tidy_run
from quodeq.data.fs.run_archive_guard import LOCK_NAME
from tests.api._scores_routes_helpers import _scorable_violations, _seed_run


def _settled_run(tmp_path):
    run = _seed_run(tmp_path, "proj", "run-1", _scorable_violations(5, dimension="security"))
    conn = sqlite3.connect(run / "evaluation.db")
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.execute("VACUUM")
    conn.close()
    (run / "evaluation.db-wal").unlink(missing_ok=True)
    (run / "evidence").mkdir(exist_ok=True)
    (run / "evidence" / "security_dispatch_keys.json").write_text("q" * 10)
    return run


def test_tidy_without_database_work_creates_no_lock_file(tmp_path):
    run = _settled_run(tmp_path)

    assert tidy_run(run) == 10

    assert not (run / LOCK_NAME).exists()
    assert not (run / "evidence" / "security_dispatch_keys.json").exists()


def test_tidy_with_free_pages_vacuums_under_the_lock(tmp_path):
    run = _settled_run(tmp_path)
    conn = sqlite3.connect(run / "evaluation.db")
    conn.execute("CREATE TABLE bulk (blob TEXT)")
    conn.executemany("INSERT INTO bulk VALUES (?)", [("x" * 4000,) for _ in range(200)])
    conn.commit()
    conn.execute("DELETE FROM bulk")
    conn.commit()
    conn.close()

    assert tidy_run(run) > 10

    assert (run / LOCK_NAME).exists()
