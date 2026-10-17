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


def check_restore_dirs(run_dir: Path) -> None:
    """Raise ``RunArchiveError`` when a restore would write through a link: the run or its evidence folder."""
    evidence = run_dir / EVIDENCE_DIR
    for folder in (run_dir, evidence):
        if folder.is_symlink():
            raise RunArchiveError(f"{folder} is a symbolic link, refusing to restore into it")
    if evidence.exists() and not evidence.is_dir():
        raise RunArchiveError(f"{evidence} is not a folder, refusing to restore into it")
