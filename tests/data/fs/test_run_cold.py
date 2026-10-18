"""A cold run: the archive gone for good, the frozen grades, dismissals and packed reports kept."""
from __future__ import annotations

import json

import pytest

from quodeq.data.fs.run_archive import RunArchiveError, archive_run, ensure_restored, has_event_log, is_archived
from quodeq.data.fs.run_cold import cold_since, is_cold, is_frozen, trim_run
from tests.services._archive_fixtures import make_run


def test_trim_turns_an_archived_run_cold_and_frees_the_archive(tmp_path):
    run = make_run(tmp_path, "r1")
    archive_run(run)
    size = (run / "archive.tar.gz").stat().st_size
    freed = trim_run(run)
    assert freed == size and is_cold(run) and is_frozen(run) and not is_archived(run)
    assert not (run / "archive.tar.gz").exists() and (run / "scalars.json").is_file()
    assert cold_since(run) is not None
    assert json.loads((run / "cold.json").read_text())["archive_bytes"] == size


def test_trim_refuses_a_warm_run_and_a_run_without_frozen_grades(tmp_path):
    warm = make_run(tmp_path, "r1")
    with pytest.raises(RunArchiveError):
        trim_run(warm)
    bare = make_run(tmp_path, "r2")
    archive_run(bare)
    (bare / "scalars.json").unlink()
    with pytest.raises(RunArchiveError):
        trim_run(bare)
    assert is_archived(bare) and not is_cold(bare) and not is_cold(warm)


def test_a_cold_run_is_frozen_but_has_no_event_log(tmp_path):
    run = make_run(tmp_path, "r1")
    archive_run(run)
    trim_run(run)
    assert is_frozen(run) and not has_event_log(run)
    assert ensure_restored(run) is False  # nothing to restore
    assert (run / "evaluation" / "security.json.gz").is_file()  # the packed report stays


def test_trim_sweeps_a_stray_database_beside_the_archive(tmp_path):
    run = make_run(tmp_path, "r1")
    archive_run(run)
    (run / "evaluation.db").write_bytes(b"stray")
    (run / "evaluation.db-wal").write_bytes(b"stray")
    trim_run(run)
    assert not (run / "evaluation.db").exists() and not (run / "evaluation.db-wal").exists()
