"""Pack an archived run's reports in place (``evaluation/<dim>.json`` to ``<dim>.json.gz``) and unpack them on restore.

The archive writes each packed file beside the plain one through a temporary
name, keeps the plain file's modification time (the projection's coverage
stamp reads it) and only then removes the plain file. A failure mid-way
leaves a mix the readers accept: the plain file wins where both exist. The
cleanup pass packs the reports of runs archived before 1.15.1 the same way,
under the run lock, without restoring them.
"""
from __future__ import annotations

import gzip
import logging
import os
from pathlib import Path

from quodeq.data.fs.report_files import (
    PACKED_REPORT_SUFFIX, REPORT_SUFFIX, is_packed_report, list_report_files, read_report_bytes, report_dimension,
)
from quodeq.data.fs.run_archive_files import ARCHIVE_FILENAME
from quodeq.data.fs.run_archive_guard import run_lock
from quodeq.data.fs.run_archive_limits import RunArchiveError

_logger = logging.getLogger(__name__)
_EVAL_DIR = "evaluation"
_TMP_SUFFIX = ".tmp"
_LEVEL = 6


def _write_replacing(dest: Path, data: bytes, mtime_ns: int) -> None:
    """Write *data* to *dest* through ``dest.tmp``, fsynced, with *mtime_ns* as its modification time."""
    tmp = dest.with_name(dest.name + _TMP_SUFFIX)
    tmp.unlink(missing_ok=True)
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o644)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.utime(tmp, ns=(mtime_ns, mtime_ns))
        os.replace(tmp, dest)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def _plain_reports(run_dir: Path) -> list[tuple[str, Path]]:
    return [(d, p) for d, p in list_report_files(run_dir / _EVAL_DIR) if not is_packed_report(p)]


def pack_reports_in_place(run_dir: Path) -> tuple[int, int]:
    """Gzip every plain report of *run_dir*; ``(bytes before, bytes after)`` of the reports packed.

    Each report is packed on its own; after the loop the first failure is
    raised as ``RunArchiveError`` with the others already done, so a run with
    a report that cannot be packed still has the rest packed. The plain file
    goes only once its packed twin is in place.
    """
    before = after = 0
    failure: OSError | None = None
    for dimension, plain in _plain_reports(run_dir):
        packed = plain.with_name(f"{dimension}{PACKED_REPORT_SUFFIX}")
        try:
            size, stamp = plain.stat().st_size, plain.stat().st_mtime_ns
            _write_replacing(packed, gzip.compress(plain.read_bytes(), _LEVEL), stamp)
            plain.unlink()
        except OSError as exc:
            failure = failure or exc
            continue
        before += size
        after += packed.stat().st_size
    if failure is not None:
        raise RunArchiveError(f"could not pack every report of {run_dir}: {failure}") from failure
    return before, after


def pack_reports_locked(run_dir: Path) -> tuple[int, int]:
    """``pack_reports_in_place`` under the run lock, for a run archived earlier; ``(0, 0)`` once it is no longer archived."""
    with run_lock(run_dir):
        if not (run_dir / ARCHIVE_FILENAME).is_file():
            return 0, 0
        return pack_reports_in_place(run_dir)


def unpack_reports_in_place(run_dir: Path) -> None:
    """Bring every packed report of *run_dir* back as a plain file, mtime kept; a plain twin wins and the packed file goes.

    A packed file that cannot be read (damaged) is logged and left in place:
    the readers skip it, and the run's grades come from the event log, not
    the report. Only a failure to write the plain file raises
    ``RunArchiveError``; the reports already unpacked stay valid.
    """
    eval_dir = run_dir / _EVAL_DIR
    try:
        packed_files = sorted(p for p in eval_dir.iterdir() if p.is_file() and is_packed_report(p))
    except OSError:
        return
    for packed in packed_files:
        plain = eval_dir / f"{report_dimension(packed)}{REPORT_SUFFIX}"
        if not plain.is_file():
            try:
                data = read_report_bytes(packed)
            except OSError as exc:
                _logger.warning("Leaving the damaged packed report %s of %s in place: %s", packed.name, run_dir, exc)
                continue
            try:
                _write_replacing(plain, data, packed.stat().st_mtime_ns)
            except OSError as exc:
                raise RunArchiveError(f"could not unpack the report {packed.name} of {run_dir}: {exc}") from exc
        packed.unlink(missing_ok=True)


def clean_report_leftovers(run_dir: Path) -> None:
    """Remove temporary report files an interrupted pack or unpack left under ``evaluation/``."""
    try:
        for path in (run_dir / _EVAL_DIR).iterdir():
            if path.name.endswith(_TMP_SUFFIX) and path.is_file():
                path.unlink(missing_ok=True)
    except OSError:
        return
