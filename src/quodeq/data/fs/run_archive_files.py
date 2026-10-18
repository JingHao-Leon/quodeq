"""Which files of a run move into ``archive.tar.gz``, which go with it, and how many bytes they take.

``run_archive`` packs exactly the sources (the event log and the evidence
logs) and deletes the dropped files (the database and its sidecars, rebuilt
from the event log on restore); the storage preview sizes both without packing.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from quodeq.data.fs.report_files import is_packed_report, list_report_files
from quodeq.data.fs.run_archive_wal import DB_NAME, WAL_NAME

ARCHIVE_FILENAME = "archive.tar.gz"
EVENTS_NAME = "events.jsonl"
EVIDENCE_DIR = "evidence"
EVIDENCE_PATTERN = "*_evidence.jsonl"
DB_SIDECARS = (WAL_NAME, "evaluation.db-shm")
DROPPED_FILES = (DB_NAME, *DB_SIDECARS)  # deleted by an archive, never packed


def is_plain_file(path: Path) -> bool:
    """A regular file that is not a symlink."""
    return path.is_file() and not path.is_symlink()


def archive_sources(run_dir: Path) -> list[tuple[str, Path]]:
    """(member name, source path) for every file that moves into the archive."""
    sources = [(EVENTS_NAME, run_dir / EVENTS_NAME)]
    evidence = run_dir / EVIDENCE_DIR
    if evidence.is_dir():
        for path in sorted(evidence.glob(EVIDENCE_PATTERN)):
            if is_plain_file(path):
                sources.append((f"{EVIDENCE_DIR}/{path.name}", path))
    return sources


def dropped_sidecars(run_dir: Path) -> list[Path]:
    """Files an archive deletes instead of packing: the database and its sidecars."""
    return [run_dir / name for name in DROPPED_FILES if (run_dir / name).is_file()]


def packed_bytes(run_dir: Path) -> int:
    """Bytes the archive would pack: event log and evidence logs."""
    return sum(p.stat().st_size for _, p in archive_sources(run_dir) if is_plain_file(p))


def dropped_bytes(run_dir: Path) -> int:
    """Bytes the archive would delete without packing: the database and its sidecars."""
    return sum(p.stat().st_size for p in dropped_sidecars(run_dir))


def report_bytes(run_dir: Path) -> int:
    """Bytes of the run's plain reports, the ones an archive gzips in place."""
    return sum(p.stat().st_size for _, p in list_report_files(run_dir / "evaluation") if not is_packed_report(p))


def write_json_sidecar(sidecar: Path, payload: dict) -> None:
    """Write *payload* to *sidecar* atomically, never through a leftover temp file or a planted symlink."""
    tmp = sidecar.with_name(sidecar.name + ".tmp")
    tmp.unlink(missing_ok=True)
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o644)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(payload))
    os.replace(tmp, sidecar)
