"""open_evaluation_db in a directory this process may not write to."""
import os
import sqlite3
import sys

import pytest

from quodeq.data.sqlite.connection import open_evaluation_db
from quodeq.data.sqlite.errors import SqliteStoreUnreadableError
from quodeq.data.sqlite.read_only import is_read_only

pytestmark = pytest.mark.skipif(
    sys.platform == "win32" or (hasattr(os, "geteuid") and os.geteuid() == 0),
    reason="needs POSIX permissions that bind the current user")


@pytest.fixture()
def locked(tmp_path):
    """Yield a helper that makes a directory read-only and restores it afterwards."""
    made = []

    def lock(path):
        path.chmod(0o555)
        made.append(path)
        return path

    yield lock
    for path in made:
        path.chmod(0o755)


def test_existing_database_opens_read_only_when_the_directory_is_not_writable(tmp_path, locked):
    run_dir = tmp_path / "run"
    with open_evaluation_db(run_dir) as conn:
        assert not is_read_only(conn)
        conn.execute("INSERT INTO run_meta (key, value) VALUES ('probe', '1')")
        conn.commit()
    locked(run_dir)
    with open_evaluation_db(run_dir) as conn:
        assert is_read_only(conn)
        assert conn.execute("SELECT value FROM run_meta WHERE key = 'probe'").fetchone()[0] == "1"
        with pytest.raises(sqlite3.OperationalError):
            conn.execute("INSERT INTO run_meta (key, value) VALUES ('x', '2')")


def test_missing_database_in_a_read_only_directory_is_an_unreadable_store(tmp_path, locked):
    empty = tmp_path / "empty"
    empty.mkdir()
    locked(empty)
    with pytest.raises(SqliteStoreUnreadableError):
        with open_evaluation_db(empty):
            pass


def test_missing_run_directory_that_cannot_be_created_still_raises(tmp_path, locked):
    parent = tmp_path / "parent"
    parent.mkdir()
    locked(parent)
    with pytest.raises(OSError):
        with open_evaluation_db(parent / "run"):
            pass
