"""Storage cleanup: tidy finished runs and archive the old ones.

On by default; the storage settings' ``auto_cleanup`` (Settings › Storage) or
``QUODEQ_STORAGE_CLEANUP=0`` turns the pass after start off. How many of a
project's newest done runs stay unpacked comes from the storage settings'
``keep_runs`` (None means tidy only); which runs are tidied and which
archived is decided in ``storage_plan``. The first start that would archive
only tidies (see ``storage_notice``).
"""
from __future__ import annotations

import threading
import time
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.core.run.state import RunState
from quodeq.services.run_keys import read_run_key_sets
from quodeq.services.storage_plan import CleanupPlan, plan_cleanup, project_in_flight, read_run  # noqa: F401
from quodeq.services.storage_notice import first_start_may_archive
from quodeq.services.storage_types import CleanupHooks, CleanupResult, ColdPolicy  # noqa: F401 -- re-exported
from quodeq.services.storage_settings import read_storage_settings
from quodeq.services.wiring import ScoreCacheError, SqliteFindingsRepository, has_evaluation_db, save_run_keys
from quodeq.services.wiring_sync import (
    RunArchiveError, archive_run, is_archived, is_frozen, pack_reports_locked, tidy_run, trim_run,
)
from quodeq.shared.env_resolve import resolve_env
from quodeq.shared.fault_isolation import run_isolated

ENV_FLAG = "QUODEQ_STORAGE_CLEANUP"
DISABLED_VALUE = "0"
WARMUP_POLL_S = 5.0
TIDY_SETTLE_S = 600.0  # a run's consolidation sidecars may still be read this soon after its status last changed


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
    """Deleted, archived or trimmed by someone else since the plan (another quodeq process, a delete)."""
    return not run_dir.is_dir() or is_frozen(run_dir)


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


def _trim_unless_gone(run_dir: Path) -> int | None:
    return None if not is_archived(run_dir) else trim_run(run_dir)


def _trim_one(run_dir: Path, log: LogSink) -> int | None:
    return run_isolated(lambda: _trim_unless_gone(run_dir), label=f"storage cleanup trim {run_dir}", log=log)


def _pack_one(run_dir: Path, log: LogSink) -> tuple[int, int] | None:
    return run_isolated(lambda: pack_reports_locked(run_dir), label=f"storage cleanup pack reports {run_dir}", log=log)


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


def _scheduled_pass(root: Path, env: Mapping[str, str], log: LogSink, *, archive: bool = True) -> CleanupResult | None:
    """One startup pass with the kept count read now, not at import; tidy only when *archive* is False."""
    settings = read_storage_settings(env)
    keep = settings.keep_runs if archive else None
    cold = ColdPolicy(cold_after_days=settings.cold_after_days if archive else None, pack=archive)
    result = try_run_cleanup(root, datetime.now(timezone.utc), keep_runs=keep, cold=cold, log=log)
    if result is None:
        log.debug("storage cleanup: another pass holds the lock, skipping the startup pass")
    return result


class _PassState:
    """One pass over the plan: which runs it visits, in which order, and what it has done so far."""

    def __init__(self, plan: CleanupPlan, pack: bool, log: LogSink) -> None:
        self.tidy, self.to_archive = set(plan.tidy), set(plan.archive)
        self.to_pack, self.to_trim = set(plan.pack if pack else ()), set(plan.trim)
        # The plan archives only runs it tidies; packs and trims come last, after everything else.
        self.runs = [*plan.tidy, *(r for r in plan.archive if r not in self.tidy), *sorted(self.to_pack | self.to_trim)]
        self.watch, self.wall_now, self.log = _InFlightWatch(), time.time(), log
        self.tidied = self.archived = self.packed = self.trimmed = self.freed = 0

    def step(self, run_dir: Path) -> None:
        """Tidy, archive, pack or trim *run_dir* as the plan says, each checked against a run in flight."""
        if run_dir in self.tidy and not _gone(run_dir) and _settled(run_dir, self.wall_now) and not self.watch.busy(run_dir.parent):
            got = _tidy_one(run_dir, self.log)
            if got is not None:
                self.tidied += 1
                self.freed += got
        # Afresh before each archive: a run started after the plan was made stops its project.
        if run_dir in self.to_archive and not self.watch.busy(run_dir.parent, fresh=True):
            done = _archive_one(run_dir, self.log)
            if done is not None:
                self.archived += 1
                self.freed += max(0, done.bytes_before - done.bytes_after)
        if run_dir in self.to_pack and not self.watch.busy(run_dir.parent, fresh=True):
            done = _pack_one(run_dir, self.log)
            if done is not None and done[0]:
                self.packed += 1
                self.freed += max(0, done[0] - done[1])
        if run_dir in self.to_trim and not self.watch.busy(run_dir.parent, fresh=True):  # last: nothing touches it after
            got = _trim_one(run_dir, self.log)
            if got is not None:
                self.trimmed += 1
                self.freed += got

    def result(self) -> CleanupResult:
        return CleanupResult(self.tidied, self.archived, self.freed, self.packed, self.trimmed)


def run_cleanup(
    evaluations_root: Path | str, now: datetime, *, keep_runs: int | None, cold: ColdPolicy = ColdPolicy(),
    log: LogSink = NULL_LOG, hooks: CleanupHooks | None = None,
) -> CleanupResult:
    """Apply the plan; one failing run is logged and the rest carry on.

    ``hooks.should_stop`` is asked before each run; True ends the pass there
    (a grade-formula rescore started, and the two must not overlap).

    *cold* says whether the reports of runs archived before they were packed
    in place are packed too (the held first start passes False) and the age
    past which an archived run is trimmed: its archive removed for good, its
    frozen grades and reports kept.

    Each run is tidied, then archived when the plan says so; ``hooks.on_progress``
    gets (runs done, runs in the pass) after each, so a pass that only tidies
    shows its progress too. A project with a run in flight is skipped
    (checked when the project folder changes, and afresh before each
    archive), and a run whose status changed within ``TIDY_SETTLE_S`` is
    not tidied.
    """
    plan = plan_cleanup(evaluations_root, now, keep_runs, cold.cold_after_days if cold.pack else None)
    state = _PassState(plan, cold.pack, log)
    on_progress, should_stop = (hooks or CleanupHooks()).on_progress, (hooks or CleanupHooks()).should_stop
    for index, run_dir in enumerate(state.runs, start=1):
        if should_stop is not None and should_stop():
            log.info("storage cleanup: stopped early, a grade-formula rescore started")
            break
        state.step(run_dir)
        if on_progress is not None:
            on_progress(index, len(state.runs))
    result = state.result()
    log.info(
        f"storage cleanup: tidied {result.tidied}, archived {result.archived}, packed the reports of {result.packed}, "
        f"trimmed {result.trimmed}, freed {result.bytes_freed} bytes",
    )
    return result


# Single flight within this process only. Another quodeq process on the same
# evaluations folder can run its own pass; the per-run archive lock
# (run_archive.run_lock) is what keeps two processes off the same run.
CLEANUP_LOCK = threading.Lock()


def try_run_cleanup(
    evaluations_root: Path | str, now: datetime, *, keep_runs: int | None, cold: ColdPolicy = ColdPolicy(),
    log: LogSink = NULL_LOG, hooks: CleanupHooks | None = None,
) -> CleanupResult | None:
    """Single-flight run_cleanup: None when another pass already holds the lock."""
    if not CLEANUP_LOCK.acquire(blocking=False):
        return None
    try:
        return run_cleanup(evaluations_root, now, keep_runs=keep_runs, cold=cold, log=log, hooks=hooks)
    finally:
        CLEANUP_LOCK.release()


def start_storage_cleanup(
    evaluations_root: Path | str, env: Mapping[str, str] | None = None, *,
    log: LogSink = NULL_LOG, warmup_idle: Callable[[], bool] | None = None, poll_s: float = WARMUP_POLL_S,
    start_pass: Callable[..., bool] | None = None,
) -> threading.Thread | None:
    """Run the cleanup on a daemon thread unless switched off; never raises.

    The thread first waits until *warmup_idle* reports nothing the pass must
    wait for (the score warm-up, a grade-formula rescore). With *start_pass*
    (the app's ``CleanJob.start``) the pass runs as that job, so Settings
    shows its progress and "clean now" answers busy; without it the pass
    runs here. Either reads the settings then: ``auto_cleanup`` off skips
    the pass, and the first start that would archive only tidies.
    """
    if not cleanup_enabled(resolve_env(env)):
        return None
    root = Path(evaluations_root)
    resolved = resolve_env(env)

    def _cleanup() -> None:
        if not read_storage_settings(resolved).auto_cleanup:
            log.debug("storage cleanup: turned off in Settings, skipping the startup pass")
            return
        archive = first_start_may_archive(root, resolved, datetime.now(timezone.utc), log)
        if start_pass is None:
            _scheduled_pass(root, resolved, log, archive=archive)
        elif not start_pass(root, resolved, log, archive=archive):
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
