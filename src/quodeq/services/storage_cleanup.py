"""Storage cleanup: tidy finished runs and archive the old ones.

On by default; ``QUODEQ_STORAGE_CLEANUP=0`` turns it off. The archive window
comes from the storage settings (None means tidy only). A run is touched only when its
``status.json`` is readable and in a terminal state. The newest finished run
of each dimension (the one the Overview reads) is tidied but never archived,
and a project with a run still in flight is left alone entirely. A restored
run counts as touched when it was restored, so it stays warm for the window.
"""
from __future__ import annotations

import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.core.run.state import TERMINAL_STATES, RunState, parse_run_state
from quodeq.services.run_keys import read_run_key_sets
from quodeq.services.wiring import ScoreCacheError, UnsupportedSchemaError, has_evaluation_db, read_status, save_run_keys
from quodeq.services.storage_settings import read_storage_settings
from quodeq.services.wiring_sync import archive_run, has_event_log, is_archived, restored_at, tidy_run
from quodeq.shared.env_resolve import resolve_env
from quodeq.shared.fault_isolation import run_isolated

ENV_FLAG = "QUODEQ_STORAGE_CLEANUP"
DISABLED_VALUE = "0"
WARMUP_POLL_S = 5.0


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
    """True unless the operator set the kill switch ``QUODEQ_STORAGE_CLEANUP=0``."""
    return env.get(ENV_FLAG) != DISABLED_VALUE


def _read_run(run_dir: Path) -> tuple[RunState | None, datetime | None]:
    """(state, start time) of a run; an unreadable status gives (None, None)."""
    try:
        status = read_status(run_dir)
    except UnsupportedSchemaError:
        return None, None
    if not isinstance(status, dict):
        return None, None
    try:
        state = parse_run_state(status.get("state"))
    except ValueError:
        state = None
    try:
        when = datetime.fromisoformat(str(status.get("started_at")).replace("Z", "+00:00"))
    except ValueError:
        return state, None
    return state, when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def _subdirs(path: Path) -> list[Path]:
    try:
        return sorted(p for p in path.iterdir() if p.is_dir() and not p.name.startswith("."))
    except OSError:
        return []


def _dimensions(run_dir: Path) -> set[str]:
    return {p.stem for p in (run_dir / "evaluation").glob("*.json")}


def _newest_per_dimension(runs: list[tuple[Path, datetime | None, RunState]]) -> set[Path]:
    """Runs the Overview may read: the newest DONE and the newest terminal run of each dimension."""
    newest: dict[tuple[str, bool], tuple[datetime, Path]] = {}
    for run_dir, when, state in runs:
        if when is None:
            continue
        for dim in _dimensions(run_dir):
            for key in ((dim, False), (dim, True)) if state == RunState.DONE else ((dim, False),):
                if key not in newest or when > newest[key][0]:
                    newest[key] = (when, run_dir)
    return {path for _, path in newest.values()}


def _in_flight(run_dir: Path, state: RunState | None) -> bool:
    """Fail safe: any run with a status that is not terminal (a crashed run included) blocks its project."""
    return state not in TERMINAL_STATES and (run_dir / "status.json").is_file()


def project_in_flight(project: Path) -> bool:
    """True when any run of *project* has a status that is not terminal."""
    return any(_in_flight(run_dir, _read_run(run_dir)[0]) for run_dir in _subdirs(project))


def _last_touched(run_dir: Path, started: datetime) -> datetime:
    """The later of the run's start and its last restore."""
    restored = restored_at(run_dir)
    return max(started, restored) if restored is not None else started


def _plan_project(project: Path, now: datetime, warm_days: int | None) -> tuple[list[Path], list[Path]]:
    runs: list[tuple[Path, datetime | None, RunState]] = []
    for run_dir in _subdirs(project):
        state, when = _read_run(run_dir)
        if _in_flight(run_dir, state):
            return [], []
        if state in TERMINAL_STATES and not is_archived(run_dir):
            runs.append((run_dir, when, state))
    protected = _newest_per_dimension(runs)
    cutoff = now - timedelta(days=warm_days) if warm_days is not None else None
    tidy = [r for r, _, _ in runs]
    archive = [] if cutoff is None else [
        r for r, w, _ in runs
        if w is not None and r not in protected and has_event_log(r) and _last_touched(r, w) < cutoff
    ]
    return tidy, archive


def plan_cleanup(evaluations_root: Path | str, now: datetime, warm_days: int | None) -> CleanupPlan:
    """Decide which runs to tidy and which to archive, without touching disk. None warm_days: tidy only."""
    tidy: list[Path] = []
    archive: list[Path] = []
    for project in _subdirs(Path(evaluations_root)):
        t, a = _plan_project(project, now, warm_days)
        tidy += t
        archive += a
    return CleanupPlan(tuple(tidy), tuple(archive))


def _keep_run_keys(run_dir: Path, log: LogSink) -> None:
    """Persist a finished run's finding keys from its database before it moves into the archive.

    An archived run's keys are then read from its reports (reading its
    database would restore the run on every cache miss); keeping the
    database's keys spares its cache version a shift from any drift.
    """
    if _read_run(run_dir)[0] != RunState.DONE or not has_evaluation_db(run_dir):
        return
    try:
        save_run_keys(run_dir.parent.name, run_dir.name, *read_run_key_sets(run_dir))
    except ScoreCacheError as exc:
        log.debug(f"storage cleanup: could not keep the run keys of {run_dir}: {exc}")


def _archive_keeping_keys(run_dir: Path, log: LogSink):
    _keep_run_keys(run_dir, log)
    return archive_run(run_dir)


def _archive_one(run_dir: Path, log: LogSink):
    return run_isolated(lambda: _archive_keeping_keys(run_dir, log), label=f"storage cleanup archive {run_dir}", log=log)


def _scheduled_pass(root: Path, env: Mapping[str, str], log: LogSink) -> CleanupResult | None:
    """One startup pass with the archive window read now, not at import."""
    days = read_storage_settings(env).archive_after_days
    result = try_run_cleanup(root, datetime.now(timezone.utc), warm_days=days, log=log)
    if result is None:
        log.debug("storage cleanup: another pass holds the lock, skipping the startup pass")
    return result


def run_cleanup(
    evaluations_root: Path | str, now: datetime, *, warm_days: int | None, log: LogSink = NULL_LOG,
    on_progress: Callable[[int, int], None] | None = None,
) -> CleanupResult:
    """Apply the plan; one failing run is logged and the rest carry on.

    *on_progress* gets (done, total) after each archive attempt.
    """
    plan = plan_cleanup(evaluations_root, now, warm_days)
    tidied = archived = freed = 0
    for run_dir in plan.tidy:
        if project_in_flight(run_dir.parent):  # a run started after the plan was made
            continue
        got = run_isolated(lambda d=run_dir: max(0, tidy_run(d)), label=f"storage cleanup tidy {run_dir}", log=log)
        if got is not None:
            tidied += 1
            freed += got
    for index, run_dir in enumerate(plan.archive, start=1):
        if not project_in_flight(run_dir.parent):  # else a run started after the plan was made
            done = _archive_one(run_dir, log)
            if done is not None:
                archived += 1
                freed += max(0, done.bytes_before - done.bytes_after)
        if on_progress is not None:
            on_progress(index, len(plan.archive))
    result = CleanupResult(tidied, archived, freed)
    log.info(f"storage cleanup: tidied {result.tidied}, archived {result.archived}, freed {result.bytes_freed} bytes")
    return result


CLEANUP_LOCK = threading.Lock()


def try_run_cleanup(
    evaluations_root: Path | str, now: datetime, *, warm_days: int | None, log: LogSink = NULL_LOG,
    on_progress: Callable[[int, int], None] | None = None,
) -> CleanupResult | None:
    """Single-flight run_cleanup: None when another pass already holds the lock."""
    if not CLEANUP_LOCK.acquire(blocking=False):
        return None
    try:
        return run_cleanup(evaluations_root, now, warm_days=warm_days, log=log, on_progress=on_progress)
    finally:
        CLEANUP_LOCK.release()


def start_storage_cleanup(
    evaluations_root: Path | str, env: Mapping[str, str] | None = None, *,
    log: LogSink = NULL_LOG, warmup_idle: Callable[[], bool] | None = None, poll_s: float = WARMUP_POLL_S,
) -> threading.Thread | None:
    """Run the cleanup on a daemon thread unless switched off; never raises.

    The thread first waits until *warmup_idle* reports the score warm-up done,
    then reads the archive window from the storage settings.
    """
    if not cleanup_enabled(resolve_env(env)):
        return None
    root = Path(evaluations_root)
    resolved = resolve_env(env)

    def _cleanup() -> None:
        run_isolated(lambda: _scheduled_pass(root, resolved, log), label="storage cleanup", log=log)

    def _run() -> None:
        pause = threading.Event()
        while warmup_idle is not None and not warmup_idle():
            pause.wait(poll_s)
        _cleanup()

    thread = threading.Thread(target=_run, name="storage-cleanup", daemon=True)
    thread.start()
    return thread
