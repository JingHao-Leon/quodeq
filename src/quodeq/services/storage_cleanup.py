"""Storage cleanup: tidy finished runs and archive the old ones.

On by default; ``QUODEQ_STORAGE_CLEANUP=0`` turns it off. The archive window
comes from the storage settings (None means tidy only); which runs are
tidied and which archived is decided in ``storage_plan``.
"""
from __future__ import annotations

import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.core.run.state import RunState
from quodeq.services.run_keys import read_run_key_sets
from quodeq.services.storage_plan import CleanupPlan, plan_cleanup, project_in_flight, read_run  # noqa: F401
from quodeq.services.storage_settings import read_storage_settings
from quodeq.services.wiring import ScoreCacheError, SqliteFindingsRepository, has_evaluation_db, save_run_keys
from quodeq.services.wiring_sync import RunArchiveError, archive_run, is_archived, tidy_run
from quodeq.shared.env_resolve import resolve_env
from quodeq.shared.fault_isolation import run_isolated

ENV_FLAG = "QUODEQ_STORAGE_CLEANUP"
DISABLED_VALUE = "0"
WARMUP_POLL_S = 5.0
TIDY_SETTLE_S = 600.0  # a run's consolidation sidecars may still be read this soon after its status last changed


@dataclass(frozen=True)
class CleanupResult:
    """What a cleanup pass did."""

    tidied: int
    archived: int
    bytes_freed: int


def cleanup_enabled(env: Mapping[str, str]) -> bool:
    """True unless the operator set the kill switch ``QUODEQ_STORAGE_CLEANUP=0``."""
    return env.get(ENV_FLAG) != DISABLED_VALUE


def _keep_run_keys(run_dir: Path, log: LogSink) -> None:
    """Persist a finished run's finding keys from its database before it moves into the archive.

    An archived run's keys are then read from its reports (reading its
    database would restore the run on every cache miss); keeping the
    database's keys spares its cache version a shift from any drift.
    """
    if read_run(run_dir)[0] != RunState.DONE or not has_evaluation_db(run_dir):
        return
    try:
        save_run_keys(run_dir.parent.name, run_dir.name, *read_run_key_sets(run_dir))
    except ScoreCacheError as exc:
        log.debug(f"storage cleanup: could not keep the run keys of {run_dir}: {exc}")


def archive_keeping_keys(run_dir: Path, log: LogSink):
    """Archive *run_dir* as cleanup does: projected first, its finding keys kept in the score cache."""
    # Fold any pending action-log delta in first: the archive's scalars.json
    # freezes the grades the run list and the trend show until it is restored.
    if not is_archived(run_dir):  # projecting would restore a run archived meanwhile
        SqliteFindingsRepository(run_dir).ensure_projected()
    _keep_run_keys(run_dir, log)
    return archive_run(run_dir)


def _gone(run_dir: Path) -> bool:
    """Deleted or archived by someone else since the plan (another quodeq process, a delete)."""
    return not run_dir.is_dir() or is_archived(run_dir)


def _archive_unless_gone(run_dir: Path, log: LogSink):
    if _gone(run_dir):
        return None
    try:
        return archive_keeping_keys(run_dir, log)
    except (RunArchiveError, OSError):
        if not _gone(run_dir):
            raise
        log.debug(f"storage cleanup: {run_dir} was archived or removed meanwhile, skipped")
        return None


def _archive_one(run_dir: Path, log: LogSink):
    return run_isolated(lambda: _archive_unless_gone(run_dir, log), label=f"storage cleanup archive {run_dir}", log=log)


def _tidy_one(run_dir: Path, log: LogSink) -> int | None:
    return run_isolated(lambda: max(0, tidy_run(run_dir)), label=f"storage cleanup tidy {run_dir}", log=log)


def _settled(run_dir: Path, wall_now: float) -> bool:
    """True when the run's status was last written ``TIDY_SETTLE_S`` ago: its scratch files are no longer needed."""
    try:
        return wall_now - (run_dir / "status.json").stat().st_mtime >= TIDY_SETTLE_S
    except OSError:
        return False


class _InFlightWatch:
    """``project_in_flight`` per project, read again only when the project folder changes.

    A run that starts adds a folder, which changes the project folder's
    modification time; re-reading every ``status.json`` before each run made
    a pass quadratic in a project's runs. Each archive still reads afresh.
    """

    def __init__(self) -> None:
        self._seen: dict[Path, tuple[object, bool]] = {}

    def busy(self, project: Path, *, fresh: bool = False) -> bool:
        try:
            st = project.stat()
            stamp: object = (st.st_mtime_ns, st.st_ino)
        except OSError:
            stamp = object()  # never equal: read afresh
        seen = self._seen.get(project)
        if fresh or seen is None or seen[0] != stamp:
            seen = (stamp, project_in_flight(project))
            self._seen[project] = seen
        return seen[1]


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

    *on_progress* gets (done, total) after each tidy and each archive attempt,
    total counting both. A project with a run in flight is skipped (checked
    when the project folder changes, and afresh before each archive), and so
    is a run whose status changed within ``TIDY_SETTLE_S``.
    """
    plan = plan_cleanup(evaluations_root, now, warm_days)
    total, step = len(plan.tidy) + len(plan.archive), 0
    watch, wall_now = _InFlightWatch(), time.time()
    tidied = archived = freed = 0

    def progressed() -> None:
        nonlocal step
        step += 1
        if on_progress is not None:
            on_progress(step, total)

    for run_dir in plan.tidy:
        if not _gone(run_dir) and _settled(run_dir, wall_now) and not watch.busy(run_dir.parent):
            got = _tidy_one(run_dir, log)
            if got is not None:
                tidied += 1
                freed += got
        progressed()
    for run_dir in plan.archive:
        if not watch.busy(run_dir.parent, fresh=True):  # else a run started after the plan was made
            done = _archive_one(run_dir, log)
            if done is not None:
                archived += 1
                freed += max(0, done.bytes_before - done.bytes_after)
        progressed()
    result = CleanupResult(tidied, archived, freed)
    log.info(f"storage cleanup: tidied {result.tidied}, archived {result.archived}, freed {result.bytes_freed} bytes")
    return result


# Single flight within this process only. Another quodeq process on the same
# evaluations folder can run its own pass; the per-run archive lock
# (run_archive.run_lock) is what keeps two processes off the same run.
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
    start_pass: Callable[[Path, Mapping[str, str], LogSink], bool] | None = None,
) -> threading.Thread | None:
    """Run the cleanup on a daemon thread unless switched off; never raises.

    The thread first waits until *warmup_idle* reports the score warm-up done.
    With *start_pass* (the app's ``CleanJob.start``) the pass runs as that
    job, so Settings shows its progress and "clean now" answers busy;
    without it the pass runs here. Either reads the archive window then.
    """
    if not cleanup_enabled(resolve_env(env)):
        return None
    root = Path(evaluations_root)
    resolved = resolve_env(env)

    def _cleanup() -> None:
        if start_pass is None:
            _scheduled_pass(root, resolved, log)
        elif not start_pass(root, resolved, log):
            log.debug("storage cleanup: a clean is already running, skipping the startup pass")

    def _isolated() -> None:
        run_isolated(_cleanup, label="storage cleanup", log=log)

    def _run() -> None:
        pause = threading.Event()
        while warmup_idle is not None and not warmup_idle():
            pause.wait(poll_s)
        _isolated()

    thread = threading.Thread(target=_run, name="storage-cleanup", daemon=True)
    thread.start()
    return thread
