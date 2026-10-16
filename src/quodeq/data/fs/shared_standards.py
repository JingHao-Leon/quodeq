"""File and git mechanics of the shared repository's ``standards/`` folder.

One ``<id>.json`` per shared custom standard. Reads never raise on a bad
file (it is skipped with a warning); writes are atomic and jailed to the
folder. Policy (what to share, sync states) lives in services.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Iterable, Mapping
from pathlib import Path

from quodeq.data.fs.run_artifacts import replace_json_file
from quodeq.data.fs.shared_repo_git import EVALUATIONS_DIRNAME, run_git, shared_repo_path
from quodeq.data.fs.shared_repo_meta import MARKER_FILENAME
from quodeq.shared.constants import JSON_SUFFIX
from quodeq.shared.validation import validate_path_segment

_logger = logging.getLogger(__name__)
SHARED_STANDARDS_DIRNAME = "standards"
_IGNORE_FILENAME = ".gitignore"
_GITKEEP = f"{EVALUATIONS_DIRNAME}/.gitkeep"


def shared_standards_dir(url: str, env: Mapping[str, str] | None = None) -> Path:
    """The clone's ``standards/`` folder for *url* (may not exist yet)."""
    return shared_repo_path(url, env) / SHARED_STANDARDS_DIRNAME


def read_shared_standards(directory: Path) -> dict[str, dict]:
    """``{id: payload}`` for every readable standard file in *directory*."""
    out: dict[str, dict] = {}
    try:
        paths = sorted(directory.glob(f"*{JSON_SUFFIX}")) if directory.is_dir() else []
    except OSError as exc:
        _logger.warning("Cannot list shared standards in %s: %s", directory, exc)
        return out
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, RecursionError) as exc:
            _logger.warning("Skipping unreadable shared standard %s: %s", path.name, exc)
            continue
        if isinstance(data, dict) and data.get("id") == path.stem:
            out[path.stem] = data
        else:
            _logger.warning("Skipping shared standard %s: not an object with a matching id", path.name)
    return out


def write_shared_standard(directory: Path, standard_id: str, payload: dict) -> None:
    """Atomically write *payload* as ``<directory>/<standard_id>.json``."""
    if not standard_id or standard_id == ".":
        raise ValueError(f"Invalid standard id: {standard_id!r}")
    validate_path_segment(standard_id)
    directory.mkdir(parents=True, exist_ok=True)
    replace_json_file(directory / f"{standard_id}{JSON_SUFFIX}", payload, indent=2)


def restore_shared_standards(repo: Path) -> tuple[bool, str]:
    """Bring the clone's ``standards/`` folder back to HEAD.

    A share or publish that failed before its commit can leave an untracked
    or modified ``standards/<id>.json`` behind, and ``reset --hard`` keeps
    untracked files: compared later, that leftover would read as already
    shared. Removes untracked files there and restores tracked ones. A
    missing clone, an empty repository or a HEAD without ``standards/`` is
    fine (nothing to restore).
    """
    if not (repo / ".git").exists():
        return True, ""
    ok, out = run_git(["clean", "-fdq", "--", SHARED_STANDARDS_DIRNAME], cwd=repo)
    if not ok:
        return ok, out
    listed, tracked = run_git(["ls-tree", "-d", "--name-only", "HEAD", "--", SHARED_STANDARDS_DIRNAME],
                              cwd=repo)
    if not listed or not tracked.strip():
        return True, ""
    return run_git(["checkout", "HEAD", "--", SHARED_STANDARDS_DIRNAME], cwd=repo)


def stage_standard_paths(repo: Path, standard_ids: Iterable[str]) -> tuple[bool, str]:
    """``git add`` the format marker, ignore file and each shared standard file.

    Literal pathspecs: an id is a file name, never a glob that could stage
    other standards.
    """
    paths = [MARKER_FILENAME, _IGNORE_FILENAME,
             *(f"{SHARED_STANDARDS_DIRNAME}/{sid}{JSON_SUFFIX}" for sid in standard_ids)]
    if (repo / _GITKEEP).exists():
        paths.append(_GITKEEP)
    return run_git(["--literal-pathspecs", "add", "--", *paths], cwd=repo)
