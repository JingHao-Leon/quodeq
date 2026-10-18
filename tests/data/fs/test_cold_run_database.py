"""A cold run never gets a database: the open is refused, no file appears, and its keys come from the reports."""
from __future__ import annotations

import pytest

from quodeq.data.fs.report_parser import read_report_key_sets
from quodeq.data.fs.run_archive import archive_run
from quodeq.data.fs.run_cold import trim_run
from quodeq.data.sqlite.connection import open_evaluation_db
from quodeq.data.sqlite.errors import SqliteStoreUnreadableError
from quodeq.data.sqlite.findings_repository import SqliteFindingsRepository
from quodeq.services.run_keys import read_run_key_sets
from tests.services._archive_fixtures import make_run


def _cold(tmp_path):
    run = make_run(tmp_path, "r1", n=4)
    archive_run(run)
    trim_run(run)
    return run


def test_a_cold_run_refuses_a_database_open_and_leaves_no_file(tmp_path):
    run = _cold(tmp_path)
    with pytest.raises(SqliteStoreUnreadableError):
        with open_evaluation_db(run):
            pass
    assert not (run / "evaluation.db").exists()
    assert read_run_key_sets(run) == read_report_key_sets(run)  # the reports answer, no database is made


def test_the_findings_repository_projects_nothing_for_a_cold_run(tmp_path):
    run = _cold(tmp_path)
    SqliteFindingsRepository(run).ensure_projected()  # no event log: a no-op, never an empty store
    assert not (run / "evaluation.db").exists()
