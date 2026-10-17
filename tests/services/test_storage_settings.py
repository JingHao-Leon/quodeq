"""The archive-after setting: persisted, validated, fail-soft."""
from __future__ import annotations

import pytest

from quodeq.services.storage_settings import (
    ARCHIVE_AFTER_CHOICES,
    StorageSettings,
    read_storage_settings,
    storage_settings_path,
    write_storage_settings,
)


def _env(tmp_path):
    return {"QUODEQ_DIR": str(tmp_path)}


def test_the_default_is_six_months_when_nothing_is_saved(tmp_path):
    assert read_storage_settings(_env(tmp_path)) == StorageSettings(archive_after_days=183)
    assert ARCHIVE_AFTER_CHOICES == (91, 183, 365, None)


@pytest.mark.parametrize("choice", ARCHIVE_AFTER_CHOICES)
def test_every_choice_round_trips(tmp_path, choice):
    env = _env(tmp_path)
    assert write_storage_settings(StorageSettings(archive_after_days=choice), env) is True
    assert read_storage_settings(env).archive_after_days == choice
    assert storage_settings_path(env) == tmp_path / "storage.json"


@pytest.mark.parametrize("body", ['{"archive_after_days": 42}', "not json", "[1]", '{"archive_after_days": "91"}'])
def test_a_bad_file_falls_back_to_the_default(tmp_path, body):
    env = _env(tmp_path)
    storage_settings_path(env).write_text(body)
    assert read_storage_settings(env).archive_after_days == 183


def test_writing_a_value_outside_the_choices_is_rejected(tmp_path):
    with pytest.raises(ValueError):
        write_storage_settings(StorageSettings(archive_after_days=42), _env(tmp_path))
    assert not storage_settings_path(_env(tmp_path)).exists()
