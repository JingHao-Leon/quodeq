"""Fingerprint of the standards a rescore reads, for the score-cache version hashes.

A rescore resolves every finding's principle against the compiled standards
(``evidence_rescore.standard_dirs``) and quarantines what no longer maps, so
an edited standard changes the rows ``run_scalars`` would hold. The version
hashes in ``score_cache`` fold this fingerprint in; without it an edit
applied only on the next full rescore.

Per run, and only what scoring reads (Victor, 2026-10-15):

- A run's fingerprint covers only the standards that run analysed
  (``run_dimension_ids``). Creating or installing a standard, or starting the
  first run of one, leaves every other run's version alone; editing or
  deleting a standard rebuilds only the runs that scored it.
- A standard is hashed by its content minus the descriptive fields
  (``_DESCRIPTIVE_KEYS``): renaming or rewording it, or saving it unchanged,
  rebuilds nothing.

Cost per request: one ``stat`` per standard file (the content is read only
when a file changes, memoized by size and mtime) and two ``stat`` calls per
run folder (its listing is memoized by the two folders' mtimes). File
mechanics live in ``data/fs/standards_scan`` and ``data/fs/run_dirs``; this
module keeps the policy and the memos, which are keyed by stamps so they
never serve a stale answer. The
project's overrides are one small JSON read, hashed by content, so a
visibility toggle (which shares that file) never changes a fingerprint.
"""
from __future__ import annotations

import hashlib
import json
import threading
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType

from quodeq.services.evidence_rescore import standard_dirs
from quodeq.services.wiring import (
    file_stamp, load_project_standards, project_run_dirs, run_dimension_ids, run_listing_stamp,
    scoring_content_hash, settings_reports_root, standard_files,
)
from quodeq.shared.utils import TEXT_ENCODING

_UNSET = object()
# Top-level fields no rescore reads: a change to them must not rebuild scores.
_DESCRIPTIVE_KEYS = frozenset({
    "name", "description", "source", "sources", "version", "type", "subtype",
    "createdAt", "updatedAt", "managed", "origin", "origin_hash", "shared_hash",
})
_MEMO_MAX = 16384
_LOCK = threading.Lock()
_CONTENT_MEMO: dict[tuple[str, int, int], str] = {}
_LISTING_MEMO: dict[str, tuple[tuple[int, int], frozenset[str]]] = {}


def _remember(memo: dict, key: object, value: object) -> None:
    with _LOCK:
        if len(memo) >= _MEMO_MAX:
            memo.clear()
        memo[key] = value


def _content_hash(path: Path) -> str | None:
    """What a rescore reads from one standard file, memoized by size and mtime."""
    stamp = file_stamp(path)
    if stamp is None:
        return None
    key = (str(path), *stamp)
    with _LOCK:
        hit = _CONTENT_MEMO.get(key)
    if hit is not None:
        return hit
    digest = scoring_content_hash(path, _DESCRIPTIVE_KEYS)
    if digest is not None:
        _remember(_CONTENT_MEMO, key, digest)
    return digest


def standards_catalog(compiled_dir: object = _UNSET) -> Mapping[str, str]:
    """``{dimension id: content hash}`` over the compiled and custom standards."""
    default_compiled, evaluators_dir = standard_dirs()
    if compiled_dir is _UNSET:
        compiled_dir = default_compiled
    catalog: dict[str, str] = {}
    for path in standard_files((compiled_dir, evaluators_dir)):
        digest = _content_hash(path)
        if digest is not None:
            sid = path.stem.lower()
            catalog[sid] = catalog.get(sid, "") + digest
    return MappingProxyType(catalog)


def run_dimensions(run_dir: Path) -> frozenset[str]:
    """``run_dimension_ids`` for *run_dir*, re-listed only when one of its two folders changed."""
    stamp = run_listing_stamp(run_dir)
    with _LOCK:
        hit = _LISTING_MEMO.get(str(run_dir))
    if hit is not None and hit[0] == stamp:
        return hit[1]
    dims = run_dimension_ids(run_dir)
    _remember(_LISTING_MEMO, str(run_dir), (stamp, dims))
    return dims


def scored_dimensions(project_dir: Path) -> frozenset[str]:
    """Lowercase ids of the dimensions any run of *project_dir* analysed.

    Known gap: a finding the enricher routed to another dimension of the same
    run sits in the scanned dimension's evidence file; if that run stopped
    before the routed-to dimension wrote its own file, edits to that standard
    go unnoticed for this run. Routing only targets the run's own dimensions.
    """
    return frozenset().union(*(run_dimensions(run) for run in project_run_dirs(project_dir)))


@dataclass(frozen=True)
class StandardsSnapshot:
    """One request's view of the standards and a project's overrides."""

    project_dir: Path
    catalog: Mapping[str, str]
    overrides: str

    @classmethod
    def load(cls, project_dir: Path, *, compiled_dir: object = _UNSET) -> "StandardsSnapshot":
        """Stat the standards once and read the project's overrides."""
        settings = load_project_standards(settings_reports_root(), project_dir.name)
        overrides = json.dumps(dict(settings.overrides) or None, sort_keys=True)
        return cls(project_dir, standards_catalog(compiled_dir), overrides)

    def _hash(self, dims: frozenset[str]) -> str:
        standards = {dim: self.catalog.get(dim) for dim in sorted(dims)}
        payload = json.dumps({"standards": standards, "overrides": self.overrides}, sort_keys=True)
        return hashlib.sha256(payload.encode(TEXT_ENCODING)).hexdigest()

    def for_run(self, run_id: str) -> str:
        """Fingerprint of the standards run *run_id* scored, plus the overrides."""
        return self._hash(run_dimensions(self.project_dir / run_id))

    def for_project(self) -> str:
        """Fingerprint of every standard any run of the project scored, plus the overrides."""
        return self._hash(scored_dimensions(self.project_dir))


def standards_fingerprint(project_dir: Path, *, compiled_dir: object = _UNSET) -> str:
    """Project-wide fingerprint (history, run log, the scores payload stamp).

    Per-run versions use :meth:`StandardsSnapshot.for_run` instead, so a
    change to one standard only moves the runs that scored it.
    """
    return StandardsSnapshot.load(project_dir, compiled_dir=compiled_dir).for_project()
