"""The grades and counts of an archived run, kept beside its archive in ``scalars.json``.

The run list, the trend, the warm-up and the accumulated walk read every run
of a project. Restoring an archived run there would un-archive the project's
whole history, so the archive writes what those readers take from
``evaluation.db`` (the dimension scores, the principle grades and the
per-dimension counts, see ``read_run_scalars``) into this uncompressed sidecar
first. Like ``precedents.json`` it is a kept file: never packed, never
restored over, overwritten by each archive and removed when one aborts.
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, fields
from pathlib import Path
from typing import TYPE_CHECKING

from quodeq.data.fs.run_archive_files import is_plain_file, write_json_sidecar
from quodeq.data.fs.run_archive_wal import DB_NAME
from quodeq.data.sqlite.grade_rows import select_dimension_scores, select_principle_grades

if TYPE_CHECKING:
    from quodeq.data.sqlite.dimension_counts import DimensionCounts

SCALARS_NAME = "scalars.json"
_VERSION = 1

Scalars = tuple[list[dict], list[dict], "dict[str, DimensionCounts]"]


def write_scalars(run_dir: Path) -> Path | None:
    """Write the sidecar from the run's folded ``evaluation.db``; its path, None without one.

    Reads the main file only (``immutable``): the caller holds the run lock,
    folded the log, and checks afterwards that nothing wrote meanwhile. A
    database this version cannot read (no grade tables yet) gets no sidecar:
    its readers then use the run's reports. Raises ``OSError`` when the file
    cannot be written.
    """
    from quodeq.data.sqlite.dimension_counts import counts_from_connection  # noqa: PLC0415 -- import cycle

    db, sidecar = run_dir / DB_NAME, run_dir / SCALARS_NAME
    sidecar.unlink(missing_ok=True)
    if not db.is_file():
        return None
    try:
        conn = sqlite3.connect(f"{db.resolve().as_uri()}?mode=ro&immutable=1", uri=True)
        try:
            dims, principles = select_dimension_scores(conn), select_principle_grades(conn)
            counts = counts_from_connection(conn)
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        return None
    write_json_sidecar(sidecar, {
        "version": _VERSION, "dimensions": dims, "principles": principles,
        "counts": {dim: asdict(c) for dim, c in counts.items()},
    })
    return sidecar


def read_scalars(run_dir: Path) -> Scalars | None:
    """``(dimension rows, principle rows, counts)`` from the sidecar; None when absent or malformed.

    A sidecar that is not a plain file (a symlink) reads as missing, and so
    does one without a scored dimension: the caller then reads the reports.
    """
    sidecar = run_dir / SCALARS_NAME
    if not is_plain_file(sidecar):
        return None
    try:
        data = json.loads(sidecar.read_text(encoding="utf-8"))
        dims, principles = data["dimensions"], data["principles"]
        counts = {dim: _counts(c) for dim, c in data["counts"].items()}
        if not dims or not all(_is_row(r, "dimension") and isinstance(r.get("score"), (int, float)) for r in dims):
            return None
        if not all(_is_row(r, "dimension") and isinstance(r.get("principle_id"), str) for r in principles):
            return None
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None
    return dims, principles, counts


def _is_row(row: object, key: str) -> bool:
    return isinstance(row, dict) and isinstance(row.get(key), str)


def _counts(raw: dict) -> "DimensionCounts":
    from quodeq.core.types.report import PrincipleCounts  # noqa: PLC0415
    from quodeq.data.sqlite.dimension_counts import DimensionCounts  # noqa: PLC0415 -- import cycle

    principles = {str(p): PrincipleCounts(**_ints(v, PrincipleCounts)) for p, v in raw["principles"].items()}
    return DimensionCounts(**_ints(raw, DimensionCounts, skip="principles"), principles=principles)


def _ints(raw: dict, cls: type, skip: str = "") -> dict[str, int]:
    """*cls*'s count fields from *raw*, every one required and an int."""
    return {f.name: _int(raw[f.name]) for f in fields(cls) if f.name != skip}


def _int(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"not a count: {value!r}")
    return value

