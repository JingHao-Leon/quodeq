"""Storage facts for Settings: sizes, run counts, the clean preview and delete all.

Sizes come from a plain ``os.scandir`` walk that skips dotfiles (the archive
lock, the restore stamp) and follows no symlinks.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from quodeq.core.run.state import TERMINAL_STATES, RunState, parse_run_state
from quodeq.services.base import ActionProvider
from quodeq.services.storage_cleanup import CLEANUP_LOCK
from quodeq.services.storage_plan import plan_cleanup
from quodeq.services.storage_settings import ArchiveNotice, StorageSettings
from quodeq.services.wiring import UnsupportedSchemaError, list_runs, read_json_object, read_status, repository_info_exists
from quodeq.services.wiring_sync import (
    ARCHIVE_FILENAME, dropped_bytes, is_cold, is_frozen, packed_bytes, report_bytes, run_pid_alive,
)

# Measured 2026-10-17 on 30 random runs: 602 MiB of packable files became 145 MiB.
# The database is deleted, not packed, so it is counted as freed in full.
ARCHIVE_SAVING = 0.76
# Measured 2026-10-18 on 20 random reports: 12.3 MB of plain reports became 2.4 MB.
ARCHIVE_SAVING_REPORTS = 0.80
_STATUS_FILE = "status.json"
_REPO_INFO_FILE = "repository_info.json"


class StorageBusyError(RuntimeError):
    """A run is in flight or a clean is running, so the evaluations cannot be deleted now.

    ``projects`` names the projects with a live run (empty when a clean is the reason).
    """

    def __init__(self, message: str, projects: tuple[str, ...] = ()) -> None:
        super().__init__(message)
        self.projects = projects


@dataclass(frozen=True)
class ProjectStorage:
    """One project's folder: its size, its runs, how many are archived (cold ones included) and how many are cold."""

    project_id: str
    bytes: int
    runs: int
    archived: int
    cold: int = 0


@dataclass(frozen=True)
class StorageSummary:
    """The whole evaluations root."""

    bytes: int
    runs: int
    archived: int
    projects: tuple[ProjectStorage, ...]
    cold: int = 0


@dataclass(frozen=True)
class CleanPreview:
    """Runs a clean would archive, archived runs whose reports it would pack, and about how many bytes it frees."""

    archive: int
    frees: int
    pack: int = 0
    trim: int = 0  # archived runs that lose their findings for good


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
    frozen, cold = sum(1 for r in runs if is_frozen(r)), sum(1 for r in runs if is_cold(r))
    return ProjectStorage(project.name, dir_size(project), len(runs), frozen, cold)


def storage_summary(root: Path) -> StorageSummary:
    """Size, runs and archived runs per project; a missing root gives zeros."""
    projects = tuple(_project_storage(p) for p in _subdirs(Path(root)))
    return StorageSummary(
        bytes=sum(p.bytes for p in projects), runs=sum(p.runs for p in projects),
        archived=sum(p.archived for p in projects), projects=projects, cold=sum(p.cold for p in projects),
    )


def _report_frees(run_dir: Path) -> float:
    """Bytes packing *run_dir*'s plain reports frees, at ARCHIVE_SAVING_REPORTS."""
    try:
        return ARCHIVE_SAVING_REPORTS * report_bytes(run_dir)
    except OSError:
        return 0.0


def _frees(run_dir: Path) -> float:
    """Bytes archiving *run_dir* frees: the dropped files in full, the packed ones at ARCHIVE_SAVING, the reports too."""
    try:
        return dropped_bytes(run_dir) + ARCHIVE_SAVING * packed_bytes(run_dir) + _report_frees(run_dir)
    except OSError:
        return 0.0


def _archive_size(run_dir: Path) -> int:
    try:
        return (run_dir / ARCHIVE_FILENAME).stat().st_size
    except OSError:
        return 0


def clean_preview(root: Path, now: datetime, keep_runs: int | None, cold_after_days: int | None = None) -> CleanPreview:
    """Runs a clean would archive, pack or trim now, and about how many bytes it would free."""
    plan = plan_cleanup(root, now, keep_runs, cold_after_days)
    frees = sum(_frees(r) for r in plan.archive) + sum(_report_frees(r) for r in plan.pack)
    frees += sum(_archive_size(r) for r in plan.trim)
    return CleanPreview(len(plan.archive), int(frees), len(plan.pack), len(plan.trim))


def _state(status: dict) -> RunState | None:
    try:
        return parse_run_state(status.get("state"))
    except ValueError:
        return None


def _run_is_live(run_dir: Path) -> bool:
    """A non-terminal run whose process is alive; unreadable or pid-less counts as live (fail safe).

    Unlike cleanup's ``project_in_flight``, a crashed run (dead pid) does not
    count, so it can never block delete all for good.
    """
    if not (run_dir / _STATUS_FILE).is_file():
        return False
    try:
        status = read_status(run_dir)
    except UnsupportedSchemaError:
        return True
    if not isinstance(status, dict):
        return True
    if _state(status) in TERMINAL_STATES:
        return False
    pid = status.get("pid")
    return not isinstance(pid, int) or isinstance(pid, bool) or run_pid_alive(run_dir, pid)


def _live_projects(projects: list[Path]) -> tuple[str, ...]:
    return tuple(p.name for p in projects if any(_run_is_live(r) for r in _subdirs(p)))


def next_start_archive(root: Path, now: datetime, settings: StorageSettings, *, cleanup_on: bool) -> CleanPreview | None:
    """What the next start archives while the first-start notice is pending; None when there is nothing to say.

    Read with the settings as they are now, so changing the kept count or
    turning cleanup off changes (or clears) the notice at once.
    """
    if settings.keep_notice is not ArchiveNotice.PENDING or not (cleanup_on and settings.auto_cleanup):
        return None
    preview = clean_preview(root, now, settings.keep_runs, settings.cold_after_days)
    return preview if preview.archive or preview.pack or preview.trim else None


def _is_project(root: Path, folder: Path) -> bool:
    """A folder the project listing would show: it has a project record or at least one run."""
    if repository_info_exists(folder):
        return True
    try:
        return bool(list_runs(root, folder.name, limit=1))
    except ValueError:  # a name no project can have
        return False


def _is_child(project: Path) -> bool:
    info = read_json_object(project / _REPO_INFO_FILE)
    return bool(info and info.get("parent"))


def delete_all_evaluations(provider: ActionProvider, root: Path) -> int:
    """Delete every project folder under *root* through ``delete_project``; the folders removed.

    Only folders the project listing would show go: any other folder (an
    evaluations folder pointed at a general place) is left alone.
    Raises ``StorageBusyError`` while a clean holds the lock or any project
    has a run in flight; nothing is deleted then. A project whose run starts
    during the deletion is kept. Parents go first, so a child their cascade
    removed is skipped instead of deleted twice.
    """
    if not CLEANUP_LOCK.acquire(blocking=False):
        raise StorageBusyError("a storage clean is running")
    try:
        projects = [p for p in _subdirs(Path(root)) if _is_project(Path(root), p)]
        live = _live_projects(projects)
        if live:
            raise StorageBusyError("an evaluation is running", live)
        # Evaluations do not take CLEANUP_LOCK, and deleting every project can
        # take a while: each project is checked again right before it goes, and
        # one whose run started meanwhile is kept. The gap left is one
        # project's check-to-delete.
        for project in sorted(projects, key=_is_child):
            if project.is_dir() and not any(_run_is_live(r) for r in _subdirs(project)):
                provider.delete_project(str(root), project.name)
        if projects:
            provider.invalidate_projects_cache()
        return sum(1 for p in projects if not p.exists())
    finally:
        CLEANUP_LOCK.release()
