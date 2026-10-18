"""keep_runs and keep_notice in storage.json: defaults, choices, round trip beside the old keys."""
from __future__ import annotations

import pytest

from quodeq.services.storage_settings import (
    ArchiveNotice, StorageSettings, read_storage_settings, write_storage_settings,
)


def test_keep_runs_defaults_to_ten_and_reads_only_its_choices(tmp_path):
    env = {"QUODEQ_DIR": str(tmp_path)}
    assert read_storage_settings(env).keep_runs == 10
    (tmp_path / "storage.json").write_text('{"keep_runs": 7}')
    assert read_storage_settings(env).keep_runs == 10
    (tmp_path / "storage.json").write_text('{"keep_runs": true}')
    assert read_storage_settings(env).keep_runs == 10
    (tmp_path / "storage.json").write_text('{"keep_runs": null}')
    assert read_storage_settings(env).keep_runs is None


def test_keep_runs_and_keep_notice_round_trip_beside_the_old_keys(tmp_path):
    env = {"QUODEQ_DIR": str(tmp_path)}
    s = StorageSettings(archive_after_days=365, keep_runs=25, keep_notice=ArchiveNotice.PENDING)
    assert write_storage_settings(s, env)
    back = read_storage_settings(env)
    assert (back.archive_after_days, back.keep_runs, back.keep_notice) == (365, 25, ArchiveNotice.PENDING)
    assert back.archive_notice is None


def test_write_refuses_a_keep_runs_outside_the_choices(tmp_path):
    with pytest.raises(ValueError):
        write_storage_settings(StorageSettings(keep_runs=7), {"QUODEQ_DIR": str(tmp_path)})


def test_a_never_choice_from_1_14_carries_over_as_keep_all(tmp_path):
    env = {"QUODEQ_DIR": str(tmp_path)}
    (tmp_path / "storage.json").write_text('{"archive_after_days": null}')
    assert read_storage_settings(env).keep_runs is None
    (tmp_path / "storage.json").write_text('{"archive_after_days": null, "keep_runs": 5}')
    assert read_storage_settings(env).keep_runs == 5
    (tmp_path / "storage.json").write_text('{"archive_after_days": 365}')
    assert read_storage_settings(env).keep_runs == 10
