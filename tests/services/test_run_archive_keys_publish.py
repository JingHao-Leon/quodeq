"""Archive minors: publish refuses an unrestorable run; archived runs keep their finding keys."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from quodeq.assistant.tools import _read_tools_scope as scope
from quodeq.data.fs import run_archive
from quodeq.data.fs.run_archive import archive_run, is_archived
from quodeq.data.sqlite.findings_queries import read_run_key_sets
from quodeq.data.sqlite.score_cache_access import persisted_run_key_sets
from quodeq.services.run_keys import read_run_key_sets as service_keys
from quodeq.services.shared_publish import copy_run
from quodeq.services.storage_cleanup import run_cleanup
from tests.services._archive_fixtures import NOW, PROJECT, corrupt, make_run


def test_publish_refuses_a_run_whose_archive_cannot_be_restored(tmp_path):
    run = make_run(tmp_path / "local", "run-old")
    corrupt(run)
    with pytest.raises(run_archive.RunArchiveError):
        copy_run(run, tmp_path / "clone" / "run-old")
    assert not (tmp_path / "clone" / "run-old" / "status.json").exists()


def test_the_assistant_finds_the_keys_of_an_archived_run(tmp_path):
    run = make_run(tmp_path, "run-old")
    ctx = SimpleNamespace(run_dir=run, findings_repo_factory=None)
    before: set[tuple] = set()
    assert scope._sql_finding_keys(ctx, before) and len(before) == 5
    archive_run(run)

    after: set[tuple] = set()
    assert scope._sql_finding_keys(ctx, after)
    assert after == before


def test_cleanup_keeps_an_archived_run_keys_from_its_database(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "cache.db"))
    old = make_run(tmp_path / "evals", "run-old", days=300)
    make_run(tmp_path / "evals", "run-new", days=10)
    keys = read_run_key_sets(old)

    run_cleanup(tmp_path / "evals", NOW, warm_days=183)

    assert is_archived(old)
    assert persisted_run_key_sets(PROJECT, "run-old") == keys


def test_the_project_list_key_read_never_restores_an_archived_run(tmp_path):
    run = make_run(tmp_path, "run-old")
    archive_run(run)
    service_keys(run)
    assert is_archived(run)
