"""The legacy in-repo standards files, read only to seed the machine settings.

``.quodeq/standards-visibility.json`` and ``.quodeq/standards-overrides.json``
are read once by ``project_standards`` when a project has no settings file
yet. Quodeq never writes or deletes them.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from quodeq.core.standards.overrides import OVERRIDES_RELPATH
from quodeq.core.standards.visibility import VISIBILITY_RELPATH, normalize_ids
from quodeq.shared.advisory_json import read_advisory_json

_logger = logging.getLogger(__name__)


def legacy_repo_visibility(repo_root: str | Path | None) -> tuple[str, ...] | None:
    """The visibility list in a repo's legacy file; None when absent or malformed."""
    if not repo_root:
        return None
    path = Path(repo_root) / VISIBILITY_RELPATH
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, RecursionError) as exc:
        _logger.warning(
            "Ignoring unreadable or malformed standards visibility %s: %s", path, exc)
        return None
    ids = data.get("visibleStandardIds") if isinstance(data, dict) else None
    if not isinstance(ids, list):
        _logger.warning(
            "Ignoring standards visibility %s: no 'visibleStandardIds' array", path)
        return None
    # An explicitly empty list is a real selection ("hide everything") and is
    # returned as-is; only a missing/!list value falls back to the defaults.
    return normalize_ids(ids)


def legacy_repo_overrides(repo_root: str | Path | None) -> dict[str, dict]:
    """Overrides in a repo's legacy file; ``{}`` when absent or malformed."""
    if not repo_root:
        return {}
    path = Path(repo_root) / OVERRIDES_RELPATH
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
