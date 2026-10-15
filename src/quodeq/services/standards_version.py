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
run folder (its listing is memoized by the two folders' mtimes). The
project's overrides are one small JSON read, hashed by content, so a
visibility toggle (which shares that file) never changes a fingerprint.
"""
from __future__ import annotations

import hashlib
import json
import threading
from dataclasses import dataclass
from pathlib import Path

from quodeq.services.evidence_rescore import standard_dirs
from quodeq.services.wiring import load_project_standards, run_dimension_ids, settings_reports_root
from quodeq.shared.constants import EVIDENCE_DIRNAME, JSON_SUFFIX
from quodeq.shared.utils import TEXT_ENCODING

_UNSET = object()
_EVALUATION_DIRNAME = "evaluation"
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


def _mtime_ns(path: Path) -> int:
    try:
        return path.stat().st_mtime_ns
    except OSError:
        return 0


def _content_hash(path: Path) -> str | None:
    """Hash of what a rescore reads from one standard file; None when it is unreadable."""
    try:
        stat = path.stat()
    except OSError:
        return None
    key = (str(path), stat.st_size, stat.st_mtime_ns)
    with _LOCK:
        hit = _CONTENT_MEMO.get(key)
    if hit is not None:
        return hit
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    try:
        data = json.loads(raw)
    except (ValueError, RecursionError):
        data = None
    if isinstance(data, dict):
        scoring = {k: v for k, v in data.items() if k not in _DESCRIPTIVE_KEYS}
        digest = hashlib.sha256(json.dumps(scoring, sort_keys=True).encode(TEXT_ENCODING)).hexdigest()
    else:
        digest = hashlib.sha256(raw).hexdigest()
    _remember(_CONTENT_MEMO, key, digest)
    return digest


def standards_catalog(compiled_dir: object = _UNSET) -> dict[str, str]:
    """``{dimension id: content hash}`` over the compiled and custom standards."""
    default_compiled, evaluators_dir = standard_dirs()
    if compiled_dir is _UNSET:
        compiled_dir = default_compiled
    catalog: dict[str, str] = {}
    for directory in (compiled_dir, evaluators_dir):
        if not isinstance(directory, Path) or not directory.is_dir():
            continue
        for path in sorted(directory.glob(f"*{JSON_SUFFIX}")):
            digest = _content_hash(path)
            if digest is not None:
                sid = path.stem.lower()
                catalog[sid] = catalog[sid] + digest if sid in catalog else digest
    return catalog


def run_dimensions(run_dir: Path) -> frozenset[str]:
    """``run_dimension_ids`` for *run_dir*, re-listed only when one of its two folders changed."""
    stamp = (_mtime_ns(run_dir / _EVALUATION_DIRNAME), _mtime_ns(run_dir / EVIDENCE_DIRNAME))
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
    try:
        runs = [e for e in project_dir.iterdir() if e.is_dir() and not e.name.startswith(".")]
    except OSError:
        return frozenset()
    return frozenset().union(*(run_dimensions(run) for run in runs))


@dataclass(frozen=True)
class StandardsSnapshot:
    """One request's view of the standards and a project's overrides."""

    project_dir: Path
    catalog: dict[str, str]
    overrides: dict | None

    @classmethod
    def load(cls, project_dir: Path, *, compiled_dir: object = _UNSET) -> "StandardsSnapshot":
        """Stat the standards once and read the project's overrides."""
        settings = load_project_standards(settings_reports_root(), project_dir.name)
        return cls(project_dir, standards_catalog(compiled_dir), dict(settings.overrides) or None)

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
