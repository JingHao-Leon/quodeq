"""Fingerprint of the standards a rescore reads, for the score-cache version hashes.

A rescore resolves every finding's principle against the compiled standards
(``evidence_rescore.standard_dirs``) and quarantines what no longer maps, so
an edited or added standard changes the rows ``run_scalars`` would hold. The
version hashes in ``score_cache`` fold this fingerprint in; without it an
edit applied only on the next full rescore.

Stat-based on purpose: a request computes it once per project, and the nine
compiled files and the custom evaluators are only ``stat``-ed, never read;
the project's overrides are one small JSON read, hashed by content. A reinstall that
rewrites mtimes makes every run stale once, which recomputes identical rows.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from quodeq.services.evidence_rescore import standard_dirs
from quodeq.services.wiring import load_project_standards
from quodeq.shared.utils import TEXT_ENCODING

_UNSET = object()


def _stat_entry(path: Path) -> list[int] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    return [stat.st_size, stat.st_mtime_ns]


def _stat_dir(directory: object) -> dict[str, list[int]]:
    """``{file name: stat entry}`` for the ``*.json`` files of *directory*; ``{}`` when it is not a directory."""
    entries: dict[str, list[int]] = {}
    if isinstance(directory, Path) and directory.is_dir():
        for path in sorted(directory.glob("*.json")):
            entry = _stat_entry(path)
            if entry is not None:
                entries[path.name] = entry
    return entries


def standards_fingerprint(project_dir: Path, *, compiled_dir: Path | None | object = _UNSET) -> str:
    """Hash of the compiled and custom standards and *project_dir*'s overrides.

    *project_dir* is ``<reports root>/<project>``; its overrides live in the
    machine settings file, hashed by their parsed content so a visibility
    toggle (which shares that file) never changes the fingerprint. *compiled_dir* defaults to
    the directory a rescore resolves. Custom evaluators count too: their
    suggested severities reach the prompt.
    """
    default_compiled, evaluators_dir = standard_dirs()
    if compiled_dir is _UNSET:
        compiled_dir = default_compiled
    compiled = _stat_dir(compiled_dir)
    evaluators = _stat_dir(evaluators_dir)
    settings = load_project_standards(project_dir.parent, project_dir.name)
    overrides = dict(settings.overrides) or None
    payload = json.dumps({"compiled": compiled, "evaluators": evaluators, "overrides": overrides}, sort_keys=True)
    return hashlib.sha256(payload.encode(TEXT_ENCODING)).hexdigest()
