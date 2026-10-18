"""A cold run: an archived run whose archive was removed for good, its frozen grades and reports kept.

``cold.json`` beside the run marks it. A cold run keeps ``scalars.json`` (grades
and counts), ``precedents.json`` (dismissals), its packed reports, status and
dimensions; its event log, evidence and database are gone, so it can neither be
restored nor rescored, and a later dismissal never reaches its grade. Readers
that serve an archived run without a restore serve a cold run the same way:
``is_frozen`` is the predicate they share.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from quodeq.data.fs.run_archive_files import ARCHIVE_FILENAME, DROPPED_FILES, write_json_sidecar
from quodeq.data.fs.run_archive_guard import run_lock
from quodeq.data.fs.run_archive_limits import RunArchiveError
from quodeq.data.fs.run_scalars import read_scalars

COLD_NAME = "cold.json"


def is_cold(run_dir: Path) -> bool:
    """True when the run's archive was removed for good and its frozen grades stand."""
    return (run_dir / COLD_NAME).is_file()


def is_frozen(run_dir: Path) -> bool:
    """True for an archived or a cold run: served from its sidecars, never restored by a routine reader."""
    return (run_dir / ARCHIVE_FILENAME).is_file() or is_cold(run_dir)


def trim_run(run_dir: Path) -> int:
    """Remove an archived run's archive for good and mark it cold; the bytes freed.

    Raises ``RunArchiveError`` unless the run is archived and has frozen
    grades (a ``scalars.json`` with a scored dimension): without them the
    trend would fall back to the eval-time grades. The marker is written before the archive goes, so an
    interruption leaves a cold run with its archive still there, which the
    next pass finishes (``is_cold`` wins over ``is_archived`` for the readers).
    Stray database files beside the archive go with it.
    """
    with run_lock(run_dir):
        archive = run_dir / ARCHIVE_FILENAME
        if not archive.is_file():
            raise RunArchiveError(f"run is not archived, nothing to trim: {run_dir}")
        if read_scalars(run_dir) is None:  # no scored dimension in the sidecar: the trend would fall back to eval-time grades
            raise RunArchiveError(f"run has no frozen grades, kept archived: {run_dir}")
        freed = archive.stat().st_size
        strays = [run_dir / name for name in DROPPED_FILES if (run_dir / name).is_file()]
        freed += sum(p.stat().st_size for p in strays)
        write_json_sidecar(run_dir / COLD_NAME, {
            "since": datetime.now(timezone.utc).isoformat(), "archive_bytes": archive.stat().st_size,
        })
        for path in [archive, *strays]:
            path.unlink(missing_ok=True)
        return freed
