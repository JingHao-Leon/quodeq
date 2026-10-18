"""Persisted storage settings: how many of a project's runs stay unpacked, and whether cleanup runs on its own.

One JSON file at ~/.quodeq/storage.json (QUODEQ_DIR overrides the directory),
same shape as shared_settings. ``keep_runs`` is how many of each project's
newest done runs stay unpacked, one of the choices below; None keeps them all
(archive nothing new). ``auto_cleanup`` False keeps the pass after start from
running (clean now still works). ``keep_notice`` records the first start under
the count rule (see ``storage_notice``); None means no start has decided it yet.
``archive_after_days`` and ``archive_notice`` are the 1.14 age rule's keys: kept
as stored for a later release, they no longer drive the plan.
"""

from __future__ import annotations

import enum
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.shared.env_paths import get_quodeq_dir
from quodeq.services.wiring import ensure_dir, read_json_object, replace_json_file

if TYPE_CHECKING:
    from collections.abc import Mapping

_FILENAME = "storage.json"
ARCHIVE_AFTER_DEFAULT = 183
ARCHIVE_AFTER_CHOICES: tuple[int | None, ...] = (91, ARCHIVE_AFTER_DEFAULT, 365, None)
KEEP_RUNS_DEFAULT = 10
KEEP_RUNS_CHOICES: tuple[int | None, ...] = (5, KEEP_RUNS_DEFAULT, 25, None)


class ArchiveNotice(enum.StrEnum):
    """Where the first-start archive notice stands, as storage.json stores it."""

    PENDING = "pending"  # a start held the archive back; Settings says what the next start archives
    DONE = "done"  # archiving runs as set


@dataclass(frozen=True)
class StorageSettings:
    """Contents of storage.json. ``keep_runs`` None means archive nothing new."""

    archive_after_days: int | None = ARCHIVE_AFTER_DEFAULT
    auto_cleanup: bool = True
    archive_notice: ArchiveNotice | None = None
    keep_runs: int | None = KEEP_RUNS_DEFAULT
    keep_notice: ArchiveNotice | None = None


def storage_settings_path(env: Mapping[str, str] | None = None) -> Path:
    """Path of the storage settings file (honors QUODEQ_DIR)."""
    return get_quodeq_dir(env) / _FILENAME


def _one_of(value: object, choices: tuple[int | None, ...]) -> bool:
    # bool is an int subclass; True must not pass for a count.
    return value is None or (isinstance(value, int) and not isinstance(value, bool) and value in choices)


def _valid(value: object) -> bool:
    return _one_of(value, ARCHIVE_AFTER_CHOICES)


def _valid_keep(value: object) -> bool:
    return _one_of(value, KEEP_RUNS_CHOICES)


def _notice(value: object) -> ArchiveNotice | None:
    try:
        return ArchiveNotice(value) if isinstance(value, str) else None
    except ValueError:
        return None


def read_storage_settings(env: Mapping[str, str] | None = None) -> StorageSettings:
    """Read the settings; a missing, corrupt or out-of-choices value gives its default."""
    data = read_json_object(storage_settings_path(env)) or {}
    days = data.get("archive_after_days", ARCHIVE_AFTER_DEFAULT)
    auto = data.get("auto_cleanup", True)
    days = days if _valid(days) else ARCHIVE_AFTER_DEFAULT
    # A 1.14 "never" (archive_after_days null) carries over as keep all until keep_runs is set.
    keep = data.get("keep_runs", None if days is None else KEEP_RUNS_DEFAULT)
    return StorageSettings(
        archive_after_days=days,
        auto_cleanup=auto if isinstance(auto, bool) else True,
        archive_notice=_notice(data.get("archive_notice")),
        keep_runs=keep if _valid_keep(keep) else KEEP_RUNS_DEFAULT,
        keep_notice=_notice(data.get("keep_notice")),
    )


def write_storage_settings(
    settings: StorageSettings, env: Mapping[str, str] | None = None, *, log: LogSink = NULL_LOG,
) -> bool:
    """Write atomically. Raises ValueError outside the choices; False when the disk write failed."""
    if not _valid(settings.archive_after_days):
        raise ValueError(f"archive_after_days must be one of {ARCHIVE_AFTER_CHOICES}")
    if not _valid_keep(settings.keep_runs):
        raise ValueError(f"keep_runs must be one of {KEEP_RUNS_CHOICES}")
    if not isinstance(settings.auto_cleanup, bool):
        raise ValueError("auto_cleanup must be true or false")
    path = storage_settings_path(env)
    try:
        ensure_dir(path.parent)
        replace_json_file(path, asdict(settings))
    except OSError as exc:
        log.debug(f"storage settings write failed (fail-soft): {exc}")
        return False
    return True
