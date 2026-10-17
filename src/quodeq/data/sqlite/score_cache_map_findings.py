"""Violation records of the map history (``map_finding``): one row per distinct finding per project.

A row holds what the app's suppression predicate reads (the snippet reduced to
fingerprints), the reported severity and the finding identity, as one compact
positional JSON list.
"""
from __future__ import annotations

import json
import sqlite3
from collections.abc import Collection, Iterable

from quodeq.core.finding_identity import SuppressionSubject, dismiss_identities
from quodeq.core.map_history.raw_run import ViolationRecord

_SEPARATORS = (",", ":")


def _encoded(record: ViolationRecord) -> str:
    """``[dim, req, principle, file, line, fingerprints, deletedFile|null, severity, fid]``."""
    s = record.subject
    deleted = None if s.deleted_file == s.file else s.deleted_file
    return json.dumps([s.dimension, s.req, s.principle, s.file, s.line, list(s.fingerprints), deleted,
                       record.severity, record.fid], separators=_SEPARATORS)


def all_text(items: Iterable[object]) -> bool:
    """Whether every item is text (the check both map-history codecs make on a stored field)."""
    return all(isinstance(i, str) for i in items)


def _fingerprints(fps: object, req: str, principle: str) -> tuple[str | None, ...] | None:
    """*fps* as the subject's fingerprints: one text or null per dismiss identity, else None."""
    if not isinstance(fps, list) or len(fps) != len(dismiss_identities(req, principle)):
        return None
    return tuple(fps) if all(fp is None or isinstance(fp, str) for fp in fps) else None


def _decoded(text: str) -> ViolationRecord | None:
    """Inverse of ``_encoded``; None for a row in another layout (its runs read as misses, the next save rewrites it).

    The suppression predicate zips the fingerprints with the dismiss
    identities, so a row whose fingerprints do not match them one for one
    does not decode.
    """
    try:
        dim, req, principle, file, line, fps, deleted, severity, fid = json.loads(text)
        texts = all_text((dim, req, principle, file, severity, fid))
        if not texts or not (deleted is None or isinstance(deleted, str)):
            return None
        fingerprints = _fingerprints(fps, req, principle)
        if fingerprints is None:
            return None
        subject = SuppressionSubject(dim, req, principle, file, int(line), fingerprints,
                                     file if deleted is None else deleted)
    except (ValueError, TypeError, OverflowError):
        return None
    return ViolationRecord(subject, severity, fid)


def _decodable(rows: Iterable[tuple[str, str]], wanted: Collection[str]) -> dict[str, ViolationRecord]:
    """The rows of *wanted* keys that decode, by key (only those rows are decoded)."""
    return {rec: got for rec, payload in rows if rec in wanted and (got := _decoded(payload)) is not None}


def load_map_findings(conn: sqlite3.Connection, project: str, wanted: Collection[str]) -> dict[str, ViolationRecord]:
    """*project*'s decodable records among the *wanted* keys (raises ``sqlite3.Error``; the caller logs)."""
    return _decodable(conn.execute("SELECT rec, payload FROM map_finding WHERE project=?", (project,)), wanted)


def _stored_keys(conn: sqlite3.Connection, project: str,
                 records: dict[str, ViolationRecord]) -> tuple[set[str], set[str]]:
    """Every record key *project* stores, and the keys of *records* whose stored row decodes, in one read.

    A row that does not decode is rewritten, not kept. With no fresh record (a warm read) there is nothing
    to rewrite, so only the keys are read: a run whose record does not decode reads as a miss, so its
    records come back fresh.
    """
    if not records:
        return {rec for (rec,) in conn.execute("SELECT rec FROM map_finding WHERE project=?", (project,))}, set()
    rows = conn.execute("SELECT rec, payload FROM map_finding WHERE project=?", (project,)).fetchall()
    return {rec for rec, _ in rows}, set(_decodable(rows, records))


def store_map_findings(conn: sqlite3.Connection, project: str, records: dict[str, ViolationRecord],
                       keep: set[str]) -> None:
    """Insert the new (or undecodable) *records* and drop *project*'s rows outside *keep*, in one commit.

    Nothing is written when nothing changed. Raises ``sqlite3.Error``; the caller logs.
    """
    stored, decodable = _stored_keys(conn, project, records)
    gone = [(project, rec) for rec in stored - keep]
    fresh = [(project, rec, _encoded(r)) for rec, r in records.items() if rec not in decodable]
    if not gone and not fresh:
        return
    conn.executemany("DELETE FROM map_finding WHERE project=? AND rec=?", gone)
    conn.executemany("INSERT OR REPLACE INTO map_finding (project, rec, payload) VALUES (?, ?, ?)", fresh)
    conn.commit()
