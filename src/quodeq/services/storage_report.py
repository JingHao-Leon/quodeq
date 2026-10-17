"""Storage facts for Settings: sizes, run counts, the clean preview and delete all.

Sizes come from a plain ``os.scandir`` walk that skips dotfiles (the archive
lock, the restore stamp) and follows no symlinks.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from quodeq.services.base import ActionProvider
from quodeq.services.storage_cleanup import CLEANUP_LOCK, plan_cleanup, project_in_flight
from quodeq.services.wiring import read_json_object
from quodeq.services.wiring_sync import is_archived, packable_bytes

# Measured 2026-10-17 on 30 random runs: 602 MiB of packable files became 145 MiB.
ARCHIVE_SAVING = 0.76
_STATUS_FILE = "status.json"
_REPO_INFO_FILE = "repository_info.json"


class StorageBusyError(RuntimeError):
    """A run is in flight or a clean is running, so the evaluations cannot be deleted now."""


@dataclass(frozen=True)
class ProjectStorage:
    """One project's folder: its size, its runs and how many of them are archived."""

    project_id: str
    bytes: int
    runs: int
    archived: int


@dataclass(frozen=True)
class StorageSummary:
    """The whole evaluations root."""

    bytes: int
    runs: int
    archived: int
    projects: tuple[ProjectStorage, ...]


@dataclass(frozen=True)
class CleanPreview:
    """How many runs a clean would archive and about how many bytes it would free."""

    archive: int
    frees: int


def _children(path: Path) -> list[os.DirEntry]:
    try:
        with os.scandir(path) as entries:
            return [e for e in entries if not e.name.startswith(".")]
    except OSError:
        return []


def _entry_size(entry: os.DirEntry, stack: list[Path]) -> int:
    try:
        if entry.is_symlink():
            return 0
        if entry.is_dir(follow_symlinks=False):
            stack.append(Path(entry.path))
            return 0
        return entry.stat(follow_symlinks=False).st_size if entry.is_file(follow_symlinks=False) else 0
    except OSError:
        return 0


def dir_size(path: Path) -> int:
    """Bytes under *path*, skipping dotfiles and symlinks; unreadable entries count as 0."""
    total, stack = 0, [Path(path)]
    while stack:
        for entry in _children(stack.pop()):
            total += _entry_size(entry, stack)
    return total


def _is_real_dir(entry: os.DirEntry) -> bool:
    try:
        return entry.is_dir(follow_symlinks=False)
    except OSError:
        return False


def _subdirs(path: Path) -> list[Path]:
    return sorted(Path(e.path) for e in _children(path) if _is_real_dir(e))


def _project_storage(project: Path) -> ProjectStorage:
    runs = [r for r in _subdirs(project) if (r / _STATUS_FILE).is_file()]
    return ProjectStorage(project.name, dir_size(project), len(runs), sum(1 for r in runs if is_archived(r)))


def storage_summary(root: Path) -> StorageSummary:
    """Size, runs and archived runs per project; a missing root gives zeros."""
    projects = tuple(_project_storage(p) for p in _subdirs(Path(root)))
    return StorageSummary(
        bytes=sum(p.bytes for p in projects), runs=sum(p.runs for p in projects),
        archived=sum(p.archived for p in projects), projects=projects,
    )


def _packable(run_dir: Path) -> int:
    try:
        return packable_bytes(run_dir)
    except OSError:
        return 0


def clean_preview(root: Path, now: datetime, warm_days: int | None) -> CleanPreview:
    """Runs a clean would archive now and the bytes it would free, estimated with ARCHIVE_SAVING."""
    plan = plan_cleanup(root, now, warm_days)
    return CleanPreview(len(plan.archive), int(ARCHIVE_SAVING * sum(_packable(r) for r in plan.archive)))


def _is_child(project: Path) -> bool:
    info = read_json_object(project / _REPO_INFO_FILE)
    return bool(info and info.get("parent"))


def delete_all_evaluations(provider: ActionProvider, root: Path) -> int:
    """Delete every project folder under *root* through ``delete_project``; the folders removed.

    Raises ``StorageBusyError`` while a clean holds the lock or any project
    has a run in flight; nothing is deleted then. Parents go first, so a
    child their cascade removed is skipped instead of deleted twice.
    """
    if not CLEANUP_LOCK.acquire(blocking=False):
        raise StorageBusyError("a storage clean is running")
    try:
        projects = _subdirs(Path(root))
        if any(project_in_flight(p) for p in projects):
            raise StorageBusyError("an evaluation is running")
        for project in sorted(projects, key=_is_child):
            if project.is_dir():
                provider.delete_project(str(root), project.name)
        if projects:
            provider.invalidate_projects_cache()
        return sum(1 for p in projects if not p.exists())
    finally:
        CLEANUP_LOCK.release()
