"""Find a symbolic link where publish would write in the shared clone.

A link committed in the shared repository (a run file, a run subfolder, the
project's actions log, the standards folder) would make publish write through
it to a file outside the clone. Publish looks for one first and refuses.
The walk never follows a link: a link is reported, not entered.
"""
from __future__ import annotations

import os
from collections.abc import Iterable
from pathlib import Path, PurePosixPath


def _linked_ancestor(repo: Path, rel: PurePosixPath) -> PurePosixPath | None:
    for depth in range(1, len(rel.parts) + 1):
        prefix = PurePosixPath(*rel.parts[:depth])
        if (repo / prefix).is_symlink():
            return prefix
    return None


def _linked_entry(repo: Path, root: Path) -> PurePosixPath | None:
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames.sort()
        for name in sorted([*dirnames, *filenames]):
            path = Path(dirpath, name)
            if path.is_symlink():
                return PurePosixPath(path.relative_to(repo).as_posix())
    return None


def find_repo_link(repo: Path, roots: Iterable[str]) -> PurePosixPath | None:
    """The first link at or under any of *roots* (paths relative to *repo*), relative to *repo*; None when there is none."""
    for root in roots:
        rel = PurePosixPath(root)
        linked = _linked_ancestor(repo, rel) or _linked_entry(repo, repo / rel)
        if linked is not None:
            return linked
    return None
