"""Persisted storage settings: how long a finished run stays unpacked.

One JSON file at ~/.quodeq/storage.json (QUODEQ_DIR overrides the directory),
same shape as shared_settings. ``archive_after_days`` is one of the choices
below; None means never archive.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import asdict, dataclass
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.services.wiring import ensure_dir, read_json_object, replace_json_file
from quodeq.shared.env_paths import get_quodeq_dir

_FILENAME = "storage.json"
ARCHIVE_AFTER_DEFAULT = 183
ARCHIVE_AFTER_CHOICES: tuple[int | None, ...] = (91, ARCHIVE_AFTER_DEFAULT, 365, None)


@dataclass(frozen=True)
class StorageSettings:
    """Contents of storage.json. ``archive_after_days`` None means never archive."""

    archive_after_days: int | None = ARCHIVE_AFTER_DEFAULT


def storage_settings_path(env: Mapping[str, str] | None = None) -> Path:
    """Path of the storage settings file (honors QUODEQ_DIR)."""
    return get_quodeq_dir(env) / _FILENAME


def _valid(value: object) -> bool:
    # bool is an int subclass; True must not pass for a day count.
    return value is None or (isinstance(value, int) and not isinstance(value, bool) and value in ARCHIVE_AFTER_CHOICES)


def read_storage_settings(env: Mapping[str, str] | None = None) -> StorageSettings:
    """Read the settings; a missing, corrupt or out-of-choices file gives the default."""
    data = read_json_object(storage_settings_path(env))
    if data is None or "archive_after_days" not in data or not _valid(data["archive_after_days"]):
        return StorageSettings()
    return StorageSettings(archive_after_days=data["archive_after_days"])


def write_storage_settings(
    settings: StorageSettings, env: Mapping[str, str] | None = None, *, log: LogSink = NULL_LOG,
) -> bool:
    """Write atomically. Raises ValueError outside the choices; False when the disk write failed."""
    if not _valid(settings.archive_after_days):
        raise ValueError(f"archive_after_days must be one of {ARCHIVE_AFTER_CHOICES}")
    path = storage_settings_path(env)
    try:
        ensure_dir(path.parent)
        replace_json_file(path, asdict(settings))
    except OSError as exc:
        log.debug(f"storage settings write failed (fail-soft): {exc}")
        return False
    return True
