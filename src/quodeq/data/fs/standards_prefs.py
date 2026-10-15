"""Filesystem store for per-project standards preferences.

Reads/writes ``<project root>/.quodeq/standards-visibility.json`` and reads
``standards-overrides.json`` + compiled dimension files. The pure logic
(validation, partitioning, param resolution) stays in ``core/standards/``;
the API layer goes through ``services/standards_prefs.py``.

Every read here is advisory, hand-writable config with a well-defined default,
so a parse failure of *any* kind degrades with a warning -- not just the
well-behaved ``OSError``/``ValueError``/``UnicodeDecodeError`` trio. In
particular, deeply nested JSON (tens of thousands of nested arrays, a ~160KB
file a buggy generator produces by accident) overflows the C decoder's call
stack and raises ``RecursionError``, which is a ``RuntimeError`` and would
otherwise escape and fail the scan.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

from quodeq.core.standards.overrides import OVERRIDES_RELPATH
from quodeq.core.standards.visibility import (
    DEFAULT_VISIBLE_STANDARDS,
    VISIBILITY_RELPATH,
    normalize_ids,
)
from quodeq.data.fs.compiled_standards import iter_compiled_standards
from quodeq.shared.advisory_json import read_advisory_json
from quodeq.shared.env_paths import get_quodeq_dir

_logger = logging.getLogger(__name__)

SETTINGS_VERSION = 2
_PROJECTS_DIRNAME = "projects"
_SETTINGS_FILENAME = "standards.json"


@dataclass(frozen=True)
class ProjectStandards:
    """One project's standards settings: which standards are on, and overrides.

    ``enabled=None`` means "never chosen": the ISO defaults apply. An empty
    tuple is a real selection (nothing enabled).
    """

    enabled: tuple[str, ...] | None = None
    overrides: Mapping[str, dict] = field(default_factory=dict)
    migrated_from: str | None = None

    @property
    def visible_ids(self) -> tuple[str, ...]:
        """The standards that are on: the explicit selection, else the ISO defaults."""
        return DEFAULT_VISIBLE_STANDARDS if self.enabled is None else self.enabled

    @property
    def is_default(self) -> bool:
        """True when no selection was ever saved."""
        return self.enabled is None


def settings_file_for_owner(owner_id: str, *, env: Mapping[str, str] | None = None) -> Path:
    """``<quodeq dir>/projects/<owner_id>/standards.json``."""
    return get_quodeq_dir(env) / _PROJECTS_DIRNAME / owner_id / _SETTINGS_FILENAME


def _clean_overrides(raw: object) -> dict[str, dict]:
    if not isinstance(raw, dict):
        return {}
    return {req: vals for req, vals in raw.items() if isinstance(req, str) and isinstance(vals, dict)}


def read_project_standards(path: Path) -> ProjectStandards:
    """The settings at *path*; defaults when absent or malformed (never raises)."""
    data, err = read_advisory_json(path)
    if err is not None:
        _logger.warning("Ignoring unreadable or malformed standards settings %s: %s", path, err)
        return ProjectStandards()
    if not isinstance(data, dict):
        return ProjectStandards()
    raw_enabled = data.get("enabled")
    enabled = normalize_ids(raw_enabled) if isinstance(raw_enabled, list) else None
    origin = data.get("migratedFrom")
    return ProjectStandards(
        enabled=enabled,
        overrides=_clean_overrides(data.get("overrides")),
        migrated_from=origin if isinstance(origin, str) else None,
    )


def write_project_standards(path: Path, standards: ProjectStandards) -> None:
    """Atomically write *standards* to *path*, creating parent dirs."""
    payload: dict[str, object] = {"version": SETTINGS_VERSION, "overrides": dict(standards.overrides)}
    if standards.enabled is not None:
        payload["enabled"] = list(standards.enabled)
    if standards.migrated_from:
        payload["migratedFrom"] = standards.migrated_from
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp: str | None = None
    try:
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".standards-", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, indent=2) + "\n")
        os.replace(tmp, path)
    except BaseException:
        if tmp is not None:
            Path(tmp).unlink(missing_ok=True)
        raise


def load_overrides_file(path: Path | None) -> dict[str, dict]:
    """Overrides from a settings file; ``{}`` for None, absent or malformed."""
    if path is None:
        return {}
    return dict(read_project_standards(path).overrides)


def load_visible_standard_ids(project_root: str | Path | None) -> tuple[str, ...]:
    """Visible standard ids for a project; defaults when absent or malformed."""
    if not project_root:
        return DEFAULT_VISIBLE_STANDARDS
    path = Path(project_root) / VISIBILITY_RELPATH
    if not path.is_file():
        return DEFAULT_VISIBLE_STANDARDS
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, RecursionError) as exc:
        _logger.warning(
            "Ignoring unreadable or malformed standards visibility %s: %s", path, exc)
        return DEFAULT_VISIBLE_STANDARDS
    ids = data.get("visibleStandardIds") if isinstance(data, dict) else None
    if not isinstance(ids, list):
        _logger.warning(
            "Ignoring standards visibility %s: no 'visibleStandardIds' array", path)
        return DEFAULT_VISIBLE_STANDARDS
    # An explicitly empty list is a real selection ("hide everything") and is
    # returned as-is; only a missing/!list value falls back to the defaults.
    return normalize_ids(ids)


def visibility_is_default(project_root: str | Path | None) -> bool:
    """True when *project_root* has no saved visibility selection on disk.

    A live ``is_file()`` stat, never cached -- callers (the standards-
    visibility PUT route) need this to reflect a save that just happened in
    the same request. No project root at all is trivially "default" (there
    is nowhere a selection file could live), mirroring
    ``load_visible_standard_ids``'s None handling.
    """
    if not project_root:
        return True
    return not (Path(project_root) / VISIBILITY_RELPATH).is_file()


def save_visible_standard_ids(project_root: str | Path, ids: list[str]) -> None:
    """Write the selection, creating ``.quodeq/`` when needed."""
    path = Path(project_root) / VISIBILITY_RELPATH
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "visibleStandardIds": list(normalize_ids(ids))}
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def load_project_overrides(project_root: str | Path | None) -> dict[str, dict]:
    """Load ``{req_id: {param: value}}``; ``{}`` when absent or malformed."""
    if not project_root:
        return {}
    path = Path(project_root) / OVERRIDES_RELPATH
    data, err = read_advisory_json(path)
    if err is not None:
        _logger.warning(
            "Ignoring unreadable or malformed standards overrides %s: %s", path, err)
        return {}
    if data is None:
        return {}
    overrides = data.get("overrides") if isinstance(data, dict) else None
    if not isinstance(overrides, dict):
        _logger.warning("Ignoring standards overrides %s: no 'overrides' object", path)
        return {}
    return {req_id: vals for req_id, vals in overrides.items() if isinstance(vals, dict)}


def save_project_overrides(project_root: str | Path, overrides: dict[str, dict]) -> None:
    """Write ``{req_id: {param: value}}``, creating ``.quodeq/`` when needed."""
    path = Path(project_root) / OVERRIDES_RELPATH
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"version": 1, "overrides": overrides}, indent=2) + "\n"
    path.write_text(payload, encoding="utf-8")


def clear_project_overrides(project_root: str | Path) -> None:
    """Remove the overrides file. No-op when it does not exist."""
    (Path(project_root) / OVERRIDES_RELPATH).unlink(missing_ok=True)


def collect_declared_params(compiled_dir: Path) -> dict[str, dict]:
    """Collect ``{req_id: params_spec}`` across every compiled dimension file."""
    declared: dict[str, dict] = {}
    for path in sorted(Path(compiled_dir).glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, RecursionError) as exc:
            _logger.warning("Skipping unreadable declared params in %s: %s", path, exc)
            continue
        for principle in data.get("principles", []):
            for req in principle.get("requirements", []):
                if req.get("id") and req.get("params"):
                    declared[req["id"]] = req["params"]
    return declared


def collect_requirement_ids(compiled_dir: Path) -> frozenset[str]:
    """Every requirement id declared by the standards in *compiled_dir*."""
    ids: set[str] = set()
    for _stem, data in iter_compiled_standards(Path(compiled_dir)):
        for principle in data.get("principles", []):
            for req in principle.get("requirements", []) if isinstance(principle, dict) else []:
                if isinstance(req, dict) and isinstance(req.get("id"), str):
                    ids.add(req["id"])
    return frozenset(ids)
