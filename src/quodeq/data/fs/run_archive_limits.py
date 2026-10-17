"""Limits every run archive must meet before anything is extracted, wherever it came from."""
from __future__ import annotations

import tarfile
from pathlib import Path

from quodeq.shared.env import env_int

EVENTS_NAME = "events.jsonl"
EVIDENCE_DIR = "evidence"
MAX_MEMBERS = 10000
_DEFAULT_MAX_MB = 2048
_MB = 1024 * 1024
# An archive someone else wrote (a shared clone's) may unpack to at most this
# many times its packed size: gzip turns repeated bytes into ~1000:1, so the
# absolute cap alone lets a few MB in a shared repo fill gigabytes here.
# Real run logs pack well under it.
_DEFAULT_MAX_RATIO = 100
# Below this unpacked total the ratio is not checked: tiny archives carry
# fixed header overhead and can never fill a disk.
_RATIO_FLOOR_BYTES = _MB


class RunArchiveError(ValueError):
    """The run cannot be archived, or its archive is unsafe or unreadable."""


def max_archive_bytes() -> int:
    """Cap on the members' total uncompressed size; ``QUODEQ_ARCHIVE_MAX_MB``, bad values use the default."""
    return env_int("QUODEQ_ARCHIVE_MAX_MB", _DEFAULT_MAX_MB, minimum=1) * _MB


def max_archive_ratio() -> int:
    """Cap on unpacked size over packed size for untrusted archives; ``QUODEQ_ARCHIVE_MAX_RATIO``."""
    return env_int("QUODEQ_ARCHIVE_MAX_RATIO", _DEFAULT_MAX_RATIO, minimum=1)


def unpacked_cap(packed_bytes: int | None = None) -> int:
    """The members' allowed total: the absolute cap, and with *packed_bytes* (an
    archive someone else wrote) also at most ``max_archive_ratio()`` times that."""
    cap = max_archive_bytes()
    if packed_bytes is None:
        return cap
    return min(cap, max(packed_bytes * max_archive_ratio(), _RATIO_FLOOR_BYTES))


def read_members(tar: tarfile.TarFile, packed_bytes: int | None = None) -> list[tarfile.TarInfo]:
    """The archive's members, read header by header; stops at the first one past the count or size cap.

    ``getmembers()`` would read every header first: a stream of tiny headers
    would fill memory before any limit is checked. *packed_bytes* (the
    archive's size on disk) adds the compression-ratio cap (``unpacked_cap``).
    """
    members: list[tarfile.TarInfo] = []
    total, cap = 0, unpacked_cap(packed_bytes)
    for index, member in enumerate(tar):
        if index >= MAX_MEMBERS:
            raise RunArchiveError(f"archive has more than the {MAX_MEMBERS} members allowed")
        total += member.size
        if total > cap:
            raise RunArchiveError(f"archive is larger than {cap // _MB} MB when unpacked")
        members.append(member)
    return members


def check_archive_limits(members: list[tarfile.TarInfo]) -> None:
    """Raise ``RunArchiveError`` when the archive has too many members, is too big or has no event log."""
    if len(members) > MAX_MEMBERS:
        raise RunArchiveError(f"archive has {len(members)} members, more than the {MAX_MEMBERS} allowed")
    total, cap = sum(m.size for m in members), max_archive_bytes()
    if total > cap:
        raise RunArchiveError(f"archive is larger than {cap // _MB} MB when unpacked ({total} bytes)")
    if not any(m.name == EVENTS_NAME for m in members):
        raise RunArchiveError(f"archive has no {EVENTS_NAME}")


def check_restore_dirs(run_dir: Path) -> None:
    """Raise ``RunArchiveError`` when a restore would write through a link: the run or its evidence folder."""
    evidence = run_dir / EVIDENCE_DIR
    for folder in (run_dir, evidence):
        if folder.is_symlink():
            raise RunArchiveError(f"{folder} is a symbolic link, refusing to restore into it")
    if evidence.exists() and not evidence.is_dir():
        raise RunArchiveError(f"{evidence} is not a folder, refusing to restore into it")
