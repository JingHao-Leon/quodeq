"""A run's per-dimension report files in both forms: ``evaluation/<dim>.json`` and, once archived, ``<dim>.json.gz``.

Every reader of reports goes through these helpers, so an archived run (whose
reports are packed in place) reads like a warm one. When a dimension has both
files (an interrupted pack or unpack), the plain one wins. A dimension name
never carries a suffix: ``security.json.gz`` is the dimension ``security``.
"""
from __future__ import annotations

import gzip
import json
import zlib
from pathlib import Path

REPORT_SUFFIX = ".json"
PACKED_REPORT_SUFFIX = ".json.gz"
_TMP_SUFFIX = ".tmp"


def report_dimension(path: Path) -> str | None:
    """The dimension a report file name carries, None for any other file (dotfiles and temp files included)."""
    name = path.name
    if name.startswith(".") or name.endswith(_TMP_SUFFIX):
        return None
    for suffix in (PACKED_REPORT_SUFFIX, REPORT_SUFFIX):
        if name.endswith(suffix) and len(name) > len(suffix):
            return name[: -len(suffix)]
    return None


def is_packed_report(path: Path) -> bool:
    """True for a ``.json.gz`` report."""
    return path.name.endswith(PACKED_REPORT_SUFFIX)


def list_report_files(eval_dir: Path) -> list[tuple[str, Path]]:
    """``(dimension, path)`` for each report under *eval_dir*, sorted by dimension, the plain file preferred.

    An unreadable or missing directory gives an empty list.
    """
    found: dict[str, Path] = {}
    try:
        entries = [p for p in eval_dir.iterdir() if p.is_file()]
    except OSError:
        return []
    for path in entries:
        dimension = report_dimension(path)
        if dimension is None:
            continue
        current = found.get(dimension)
        if current is None or (is_packed_report(current) and not is_packed_report(path)):
            found[dimension] = path
    return sorted(found.items())


def report_file(eval_dir: Path, dimension: str) -> Path | None:
    """The report of *dimension* under *eval_dir*: the plain file, else the packed one, else None."""
    for suffix in (REPORT_SUFFIX, PACKED_REPORT_SUFFIX):
        path = eval_dir / f"{dimension}{suffix}"
        if path.is_file():
            return path
    return None


def read_report_bytes(path: Path) -> bytes:
    """The report's bytes, decompressed when packed; a damaged packed file raises ``gzip.BadGzipFile`` (an ``OSError``)."""
    if not is_packed_report(path):
        return path.read_bytes()
    try:
        with gzip.open(path, "rb") as fh:
            return fh.read()
    except (zlib.error, EOFError) as exc:  # a damaged deflate stream or a truncated file, not just a bad header
        raise gzip.BadGzipFile(f"{path.name}: {exc}") from exc


def read_report_json(path: Path) -> object:
    """The report parsed as JSON; a malformed file raises ``json.JSONDecodeError`` as a plain one does."""
    return json.loads(read_report_bytes(path).decode("utf-8"))


def report_stamp_ns(path: Path) -> int:
    """The report's modification time in nanoseconds (the same for a report before and after packing)."""
    return path.stat().st_mtime_ns
