"""Fingerprint of the standards a rescore reads, for the score-cache version hashes.

A rescore resolves every finding's principle against the compiled standards
(``evidence_rescore.standard_dirs``) and quarantines what no longer maps, so
an edited or added standard changes the rows ``run_scalars`` would hold. The
version hashes in ``score_cache`` fold this fingerprint in; without it an
edit applied only on the next full rescore.

Only the standards a run of the project analysed count (``scored_dimensions``):
creating or installing a standard no run has scored rebuilds nothing, while
editing or deleting one rebuilds only the projects that scored it.

Stat-based on purpose: a request computes it once per project; the run folders
are only listed, and the matching compiled files and custom evaluators are
only ``stat``-ed, never read;
the project's overrides are one small JSON read, hashed by content. A reinstall that
rewrites mtimes makes every run stale once, which recomputes identical rows.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from quodeq.services.evidence_rescore import standard_dirs
from quodeq.services.wiring import load_project_standards, settings_reports_root
from quodeq.shared.constants import JSON_SUFFIX
from quodeq.shared.utils import TEXT_ENCODING

_UNSET = object()
_EVIDENCE_SUFFIX = "_evidence.jsonl"


def _listing(directory: Path) -> list[Path]:
    try:
        return list(directory.iterdir())
    except OSError:
        return []


def scored_dimensions(project_dir: Path) -> frozenset[str]:
    """Lowercase ids of the dimensions any run of *project_dir* analysed.

    Directory listings only (no file reads): a finished run leaves
    ``<run>/evaluation/<dim>.json``; a run still in progress has at least
    ``<run>/evidence/<dim>_evidence.jsonl``. Anything that is not a run
    folder contributes nothing.
    """
    dims: set[str] = set()
    for run in _listing(project_dir):
        if run.name.startswith(".") or not run.is_dir():
            continue
        for path in _listing(run / "evaluation"):
            if path.suffix == JSON_SUFFIX:
                dims.add(path.stem.lower())
        for path in _listing(run / "evidence"):
            if path.name.endswith(_EVIDENCE_SUFFIX):
                dims.add(path.name[: -len(_EVIDENCE_SUFFIX)].lower())
    return frozenset(dims)


def _stat_entry(path: Path) -> list[int] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    return [stat.st_size, stat.st_mtime_ns]


def _stat_dir(directory: object, scored: frozenset[str]) -> dict[str, list[int]]:
    """``{file name: stat entry}`` for the ``*.json`` files of *directory* whose stem a run scored.

    ``{}`` when *directory* is not a directory.
    """
    entries: dict[str, list[int]] = {}
    if isinstance(directory, Path) and directory.is_dir():
        for path in sorted(directory.glob("*.json")):
            if path.stem.lower() not in scored:
                continue
            entry = _stat_entry(path)
            if entry is not None:
                entries[path.name] = entry
    return entries


def standards_fingerprint(project_dir: Path, *, compiled_dir: Path | None | object = _UNSET) -> str:
    """Hash of the standards *project_dir*'s runs scored, and its overrides.

    *project_dir* is ``<reports root>/<project>``; its overrides live in the
    machine settings file (owner resolved under the local evaluations root),
    hashed by their parsed content so a visibility toggle (which shares that
    file) never changes the fingerprint. The first read may migrate legacy
    repo files into that file. *compiled_dir* defaults to
    the directory a rescore resolves. Custom evaluators count too: their
    suggested severities reach the prompt.
    """
    default_compiled, evaluators_dir = standard_dirs()
    if compiled_dir is _UNSET:
        compiled_dir = default_compiled
    scored = scored_dimensions(project_dir)
    compiled = _stat_dir(compiled_dir, scored)
    evaluators = _stat_dir(evaluators_dir, scored)
    settings = load_project_standards(settings_reports_root(), project_dir.name)
    overrides = dict(settings.overrides) or None
    payload = json.dumps({"compiled": compiled, "evaluators": evaluators, "overrides": overrides}, sort_keys=True)
    return hashlib.sha256(payload.encode(TEXT_ENCODING)).hexdigest()
