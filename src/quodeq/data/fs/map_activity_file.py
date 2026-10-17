"""The published git activity of a shared project: ``<project>/map_activity.json``.

Written by the publisher next to the runs it shares; read by every viewer of
the shared mirror instead of running git on a path the repository names.
"""
from __future__ import annotations

import json
from pathlib import Path

from quodeq.data.fs.run_artifacts import replace_json_file

ACTIVITY_FILENAME = "map_activity.json"
# A shared file is untrusted: an oversized one is ignored rather than parsed.
_MAX_BYTES = 32 * 1024 * 1024


def read_published_activity(project_dir: Path) -> object | None:
    """The parsed file, or None when absent, a symlink, oversized or not JSON."""
    path = project_dir / ACTIVITY_FILENAME
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > _MAX_BYTES:
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, RecursionError):
        return None


def write_published_activity(project_dir: Path, payload: dict) -> None:
    """Write *payload* as the project's published activity."""
    replace_json_file(project_dir / ACTIVITY_FILENAME, payload)
