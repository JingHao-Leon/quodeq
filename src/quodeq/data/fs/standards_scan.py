"""File mechanics behind the standards fingerprint (``services/standards_version``).

Listing the standard files, stat stamps and a content hash that leaves out
fields the caller names. The service keeps the policy (which fields are
descriptive, what to memoize); the reads live here. An unreadable or
unparseable file never raises: it hashes by its raw bytes, or is absent.
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from pathlib import Path

from quodeq.shared.constants import JSON_SUFFIX
from quodeq.shared.utils import TEXT_ENCODING


def standard_files(directories: Iterable[object]) -> list[Path]:
    """The ``*.json`` files of each existing directory, sorted per directory."""
    files: list[Path] = []
    for directory in directories:
        if isinstance(directory, Path) and directory.is_dir():
            files.extend(sorted(directory.glob(f"*{JSON_SUFFIX}")))
    return files


def file_stamp(path: Path) -> tuple[int, int] | None:
    """``(size, mtime_ns)`` of *path*, or None when it cannot be stat'd."""
    try:
        stat = path.stat()
    except OSError:
        return None
    return stat.st_size, stat.st_mtime_ns


def scoring_content_hash(path: Path, ignore_keys: frozenset[str]) -> str | None:
    """SHA-256 of *path*'s JSON object minus *ignore_keys*; raw bytes when not an object."""
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    try:
        data = json.loads(raw)
    except (ValueError, RecursionError):
        data = None
    if not isinstance(data, dict):
        return hashlib.sha256(raw).hexdigest()
    kept = {k: v for k, v in data.items() if k not in ignore_keys}
    return hashlib.sha256(json.dumps(kept, sort_keys=True).encode(TEXT_ENCODING)).hexdigest()
