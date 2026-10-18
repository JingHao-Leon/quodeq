"""The "clean now" job behind POST /api/storage/clean.

One pass at a time across the whole process: ``start`` takes the shared
``CLEANUP_LOCK`` itself, so a press while the startup pass (or an earlier
press) still runs is refused at once instead of reporting a pass that never
ran. The daemon thread runs the cleanup with the kept count read at
start and releases the lock when it ends, whatever happens.
"""
from __future__ import annotations

import enum
import threading
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.services.storage_cleanup import CLEANUP_LOCK, CleanupHooks, CleanupResult, ColdPolicy, run_cleanup
from quodeq.services.storage_settings import read_storage_settings
from quodeq.shared.fault_isolation import run_isolated

WORKER_THREAD_NAME = "storage-clean"


class CleanState(enum.StrEnum):
    """Wire values of ``clean.state``."""

    IDLE = "idle"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class CleanJob:
    """Runs one storage clean on a daemon thread and reports its progress.

    *rescore_busy* (default: never) says a grade-formula rescore is running
    or owed: a pass neither starts then nor carries on once one starts, since
    the rescore restores the runs a pass archives. *warmup_active* (default:
    never) is the score warm-up, which a pass waits for at start only.
    """

    def __init__(
        self, *, rescore_busy: Callable[[], bool] | None = None, warmup_active: Callable[[], bool] | None = None,
    ) -> None:
        self._rescore_busy = rescore_busy or (lambda: False)
        self._warmup_active = warmup_active or (lambda: False)
        self._mu = threading.Lock()
        self._state = CleanState.IDLE
        self._done = self._total = self._archived = self._packed = self._trimmed = self._freed = 0

    def ready(self) -> bool:
        """True when nothing a pass must wait for runs: the score warm-up and a grade-formula rescore."""
        return not self._warmup_active() and not self._rescore_busy()

    def start(
        self, root: Path | str, env: Mapping[str, str] | None = None, log: LogSink = NULL_LOG, *, archive: bool = True,
    ) -> bool:
        """Start a pass over *root*, tidy only when *archive* is False.

        False when a clean (this job's or the startup one) is running, or a
        grade-formula rescore is running or owed.
        """
        if self._rescore_busy() or not CLEANUP_LOCK.acquire(blocking=False):
            return False
        try:
            settings = read_storage_settings(env)
            keep = settings.keep_runs if archive else None
            cold = ColdPolicy(cold_after_days=settings.cold_after_days if archive else None, pack=archive)
            with self._mu:
                self._state = CleanState.RUNNING
                self._done = self._total = self._archived = self._packed = self._trimmed = self._freed = 0
            thread = threading.Thread(
                target=self._run, args=(Path(root), keep, cold, log), name=WORKER_THREAD_NAME, daemon=True,
            )
            thread.start()
        except BaseException:
            self._finish(CleanState.FAILED)
            CLEANUP_LOCK.release()
            raise
        return True

    def snapshot(self) -> dict:
        """camelCase ``clean`` object of the storage responses."""
        with self._mu:
            return {
                "state": self._state.value, "done": self._done, "total": self._total,
                "archived": self._archived, "packed": self._packed, "trimmed": self._trimmed, "bytesFreed": self._freed,
            }

    def _run(self, root: Path, keep: int | None, cold: ColdPolicy, log: LogSink) -> None:
        try:
            self._isolated_pass(root, keep, cold, log)
        finally:
            CLEANUP_LOCK.release()

    def _isolated_pass(self, root: Path, keep: int | None, cold: ColdPolicy, log: LogSink) -> None:
        run_isolated(
            lambda: self._pass(root, keep, cold, log), label="storage clean now", log=log,
            on_error=lambda _exc: self._finish(CleanState.FAILED),
        )

    def _pass(self, root: Path, keep: int | None, cold: ColdPolicy, log: LogSink) -> None:
        now = datetime.now(timezone.utc)
        hooks = CleanupHooks(on_progress=self._on_progress, should_stop=self._rescore_busy)
        result = run_cleanup(root, now, keep_runs=keep, cold=cold, log=log, hooks=hooks)
        self._finish(CleanState.DONE, result)

    def _finish(self, state: CleanState, result: CleanupResult | None = None) -> None:
        with self._mu:
            self._state = state
            if result is not None:
                self._archived, self._packed, self._trimmed = result.archived, result.packed, result.trimmed
                self._freed = result.bytes_freed

    def _on_progress(self, done: int, total: int) -> None:
        with self._mu:
            self._done, self._total = done, total
