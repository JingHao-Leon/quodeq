"""Violation records of the map history (``map_finding``): one row per distinct finding per project.

A row holds what the app's suppression predicate reads (the snippet reduced to
fingerprints), the reported severity and the finding identity, as one compact
positional JSON list.
"""
from __future__ import annotations

import json
import sqlite3

from quodeq.core.finding_identity import SuppressionSubject
from quodeq.core.map_history.raw_run import ViolationRecord

_SEPARATORS = (",", ":")


def _encoded(record: ViolationRecord) -> str:
    """``[dim, req, principle, file, line, fingerprints, deletedFile|null, severity, fid]``."""
    s = record.subject
    deleted = None if s.deleted_file == s.file else s.deleted_file
    return json.dumps([s.dimension, s.req, s.principle, s.file, s.line, list(s.fingerprints), deleted,
                       record.severity, record.fid], separators=_SEPARATORS)


def _decoded(text: str) -> ViolationRecord | None:
    """Inverse of ``_encoded``; None for a row in another layout (its runs read as misses)."""
    try:
        dim, req, principle, file, line, fps, deleted, severity, fid = json.loads(text)
        subject = SuppressionSubject(dim, req, principle, file, int(line), tuple(fps),
                                     file if deleted is None else deleted)
    except (ValueError, TypeError, OverflowError):
        return None
    return ViolationRecord(subject, severity, fid)


def load_map_findings(conn: sqlite3.Connection, project: str) -> dict[str, ViolationRecord]:
    """Every decodable record of *project* by key (raises ``sqlite3.Error``; the caller logs)."""
    rows = conn.execute("SELECT rec, payload FROM map_finding WHERE project=?", (project,)).fetchall()
    return {rec: got for rec, payload in rows if (got := _decoded(payload)) is not None}


def store_map_findings(conn: sqlite3.Connection, project: str, records: dict[str, ViolationRecord],
                       keep: set[str]) -> None:
    """Insert the new (or undecodable) *records* and drop *project*'s rows outside *keep*, in one commit.

    Nothing is written when nothing changed. Raises ``sqlite3.Error``; the caller logs.
    """
    stored = {rec for (rec,) in conn.execute("SELECT rec FROM map_finding WHERE project=?", (project,))}
    decodable = set(load_map_findings(conn, project))  # a row that does not decode is rewritten, not kept
    gone = [(project, rec) for rec in stored - keep]
    fresh = [(project, rec, _encoded(r)) for rec, r in records.items() if rec not in decodable]
    if not gone and not fresh:
        return
    conn.executemany("DELETE FROM map_finding WHERE project=? AND rec=?", gone)
    conn.executemany("INSERT OR REPLACE INTO map_finding (project, rec, payload) VALUES (?, ?, ?)", fresh)
    conn.commit()
