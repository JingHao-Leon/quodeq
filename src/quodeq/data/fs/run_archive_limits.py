"""Limits every run archive must meet before anything is extracted, wherever it came from."""
from __future__ import annotations

import fnmatch
import posixpath
import tarfile
from pathlib import Path

from quodeq.data.fs.run_archive_files import EVIDENCE_PATTERN
from quodeq.data.fs.run_archive_wal import DB_NAME
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


def check_packable(sizes: list[int]) -> None:
    """Raise ``RunArchiveError`` when files of these *sizes* would make an archive no restore accepts.

    The same member and size caps a restore enforces, checked before packing:
    a run archived past them could never be opened again.
    """
    if len(sizes) > MAX_MEMBERS:
        raise RunArchiveError(f"run has {len(sizes)} files to pack, more than the {MAX_MEMBERS} a restore allows")
    total, cap = sum(sizes), max_archive_bytes()
    if total > cap:
        raise RunArchiveError(f"run is larger than the {cap // _MB} MB a restore allows ({total} bytes), left unpacked")


def check_restore_dirs(run_dir: Path) -> None:
    """Raise ``RunArchiveError`` when a restore would write through a link: the run or its evidence folder."""
    evidence = run_dir / EVIDENCE_DIR
    for folder in (run_dir, evidence):
        if folder.is_symlink():
            raise RunArchiveError(f"{folder} is a symbolic link, refusing to restore into it")
    if evidence.exists() and not evidence.is_dir():
        raise RunArchiveError(f"{evidence} is not a folder, refusing to restore into it")


def _allowed_name(name: str) -> bool:
    """True for ``events.jsonl``, ``evaluation.db`` and ``evidence/<x>_evidence.jsonl`` only."""
    if name in (EVENTS_NAME, DB_NAME):
        return True
    folder, _, base = name.partition("/")
    return folder == EVIDENCE_DIR and "/" not in base and fnmatch.fnmatchcase(base, EVIDENCE_PATTERN)


def check_members(members: list[tarfile.TarInfo], staging: Path) -> list[str]:
    """Member names when every member is a safe regular file, else raise ``RunArchiveError``."""
    check_archive_limits(members)
    root = staging.resolve()
    names: list[str] = []
    for member in members:
        name = member.name
        if not member.isreg():
            raise RunArchiveError(f"archive member {name!r} is not a regular file")
        if "\\" in name or posixpath.isabs(name) or posixpath.normpath(name) != name:
            raise RunArchiveError(f"archive member {name!r} has an unsafe path")
        if not (root / name).resolve().is_relative_to(root) or not _allowed_name(name):
            raise RunArchiveError(f"archive member {name!r} is not an archived run file")
        if name in names:
            raise RunArchiveError(f"archive member {name!r} appears twice")
        names.append(name)
    return names
