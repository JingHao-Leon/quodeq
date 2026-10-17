"""Opt-in storage cleanup: tidy finished runs and archive the old ones.

Off unless ``QUODEQ_STORAGE_CLEANUP=1``. A run is touched only when its
``status.json`` is readable and in a terminal state. The newest finished run
of each dimension (the one the Overview reads) is tidied but never archived,
and a project with a run still in flight is left alone entirely.
"""
from __future__ import annotations

import threading
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.core.run.state import TERMINAL_STATES
from quodeq.services.wiring import UnsupportedSchemaError, read_status
from quodeq.services.wiring_sync import archive_run, has_event_log, is_archived, tidy_run
from quodeq.shared.env_resolve import resolve_env
from quodeq.shared.fault_isolation import run_isolated

WARM_DAYS_DEFAULT = 183
ENV_FLAG = "QUODEQ_STORAGE_CLEANUP"
ENABLED_VALUE = "1"


@dataclass(frozen=True)
class CleanupPlan:
    """Run folders to tidy and run folders to archive."""

    tidy: tuple[Path, ...]
    archive: tuple[Path, ...]


@dataclass(frozen=True)
class CleanupResult:
    """What a cleanup pass did."""

    tidied: int
    archived: int
    bytes_freed: int


def cleanup_enabled(env: Mapping[str, str]) -> bool:
    """True only when the operator opted in with ``QUODEQ_STORAGE_CLEANUP=1``."""
    return env.get(ENV_FLAG) == ENABLED_VALUE


def _started_at(run_dir: Path) -> tuple[bool, datetime | None]:
    """(finished, start time) for a run; unreadable status means (False, None)."""
    try:
        status = read_status(run_dir)
    except UnsupportedSchemaError:
        return False, None
    if not isinstance(status, dict):
        return False, None
    finished = status.get("state") in {s.value for s in TERMINAL_STATES}
    raw = status.get("started_at")
    try:
        when = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return finished, None
    return finished, when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def _subdirs(path: Path) -> list[Path]:
    try:
        return sorted(p for p in path.iterdir() if p.is_dir() and not p.name.startswith("."))
    except OSError:
        return []


def _dimensions(run_dir: Path) -> set[str]:
    return {p.stem for p in (run_dir / "evaluation").glob("*.json")}


def _plan_project(project: Path, now: datetime, warm_days: int) -> tuple[list[Path], list[Path]]:
    runs = []
    for run_dir in _subdirs(project):
        finished, when = _started_at(run_dir)
        if not finished and (run_dir / "status.json").is_file() and when is not None:
            return [], []  # a run in flight: leave the whole project alone
        if finished and not is_archived(run_dir):
            runs.append((run_dir, when))
    newest: dict[str, tuple[datetime, Path]] = {}
    for run_dir, when in runs:
        for dim in _dimensions(run_dir):
            if when is not None and (dim not in newest or when > newest[dim][0]):
                newest[dim] = (when, run_dir)
    protected = {path for _, path in newest.values()}
    cutoff = now - timedelta(days=warm_days)
    tidy = [r for r, _ in runs]
    archive = [r for r, w in runs if w is not None and w < cutoff and r not in protected and has_event_log(r)]
    return tidy, archive


def plan_cleanup(evaluations_root: Path, now: datetime, warm_days: int = WARM_DAYS_DEFAULT) -> CleanupPlan:
    """Decide which runs to tidy and which to archive, without touching disk."""
    tidy: list[Path] = []
    archive: list[Path] = []
    for project in _subdirs(evaluations_root):
        t, a = _plan_project(project, now, warm_days)
        tidy += t
        archive += a
    return CleanupPlan(tuple(tidy), tuple(archive))


def run_cleanup(evaluations_root: Path, now: datetime, *, log: LogSink = NULL_LOG) -> CleanupResult:
    """Apply the plan; one failing run is logged and the rest carry on."""
    plan = plan_cleanup(evaluations_root, now)
    tidied = archived = freed = 0
    for run_dir in plan.tidy:
        got = run_isolated(lambda d=run_dir: max(0, tidy_run(d)), label=f"storage cleanup tidy {run_dir}", log=log)
        if got is not None:
            tidied += 1
            freed += got
    for run_dir in plan.archive:
        done = run_isolated(lambda d=run_dir: archive_run(d), label=f"storage cleanup archive {run_dir}", log=log)
        if done is not None:
            archived += 1
            freed += max(0, done.bytes_before - done.bytes_after)
    result = CleanupResult(tidied, archived, freed)
    log.info(f"storage cleanup: tidied {result.tidied}, archived {result.archived}, freed {result.bytes_freed} bytes")
    return result


def start_storage_cleanup(
    evaluations_root: Path, env: Mapping[str, str] | None = None, *, log: LogSink = NULL_LOG,
) -> threading.Thread | None:
    """Run the cleanup on a daemon thread when opted in; never raises."""
    if not cleanup_enabled(resolve_env(env)):
        return None

    def _run() -> None:
        run_isolated(lambda: run_cleanup(evaluations_root, datetime.now(timezone.utc), log=log),
                     label="storage cleanup", log=log)

    thread = threading.Thread(target=_run, name="storage-cleanup", daemon=True)
    thread.start()
    return thread
