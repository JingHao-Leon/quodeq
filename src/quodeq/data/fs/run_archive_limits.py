"""Limits every run archive must meet before anything is extracted, wherever it came from."""
from __future__ import annotations

import tarfile

from quodeq.shared.env import env_int

EVENTS_NAME = "events.jsonl"
MAX_MEMBERS = 10000
_DEFAULT_MAX_MB = 2048
_MB = 1024 * 1024


class RunArchiveError(ValueError):
    """The run cannot be archived, or its archive is unsafe or unreadable."""


def max_archive_bytes() -> int:
    """Cap on the members' total uncompressed size; ``QUODEQ_ARCHIVE_MAX_MB``, bad values use the default."""
    return env_int("QUODEQ_ARCHIVE_MAX_MB", _DEFAULT_MAX_MB, minimum=1) * _MB


def check_archive_limits(members: list[tarfile.TarInfo]) -> None:
    """Raise ``RunArchiveError`` when the archive has too many members, is too big or has no event log."""
    if len(members) > MAX_MEMBERS:
        raise RunArchiveError(f"archive has {len(members)} members, more than the {MAX_MEMBERS} allowed")
    total, cap = sum(m.size for m in members), max_archive_bytes()
    if total > cap:
        raise RunArchiveError(f"archive is larger than {cap // _MB} MB when unpacked ({total} bytes)")
    if not any(m.name == EVENTS_NAME for m in members):
        raise RunArchiveError(f"archive has no {EVENTS_NAME}")
