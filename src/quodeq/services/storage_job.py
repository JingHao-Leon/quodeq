"""The "clean now" job behind POST /api/storage/clean.

One pass at a time across the whole process: ``start`` takes the shared
``CLEANUP_LOCK`` itself, so a press while the startup pass (or an earlier
press) still runs is refused at once instead of reporting a pass that never
ran. The daemon thread runs the cleanup with the archive window read at
start and releases the lock when it ends, whatever happens.
"""
from __future__ import annotations

import enum
import threading
from collections.abc import Mapping
from datetime import datetime, timezone
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.services.storage_cleanup import CLEANUP_LOCK, CleanupResult, run_cleanup
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
    """Runs one storage clean on a daemon thread and reports its progress."""

    def __init__(self) -> None:
        self._mu = threading.Lock()
        self._state = CleanState.IDLE
        self._done = self._total = self._archived = self._freed = 0

    def start(self, root: Path | str, env: Mapping[str, str] | None = None, log: LogSink = NULL_LOG) -> bool:
        """Start a pass over *root*; False when a clean (this job's or the startup one) is running."""
        if not CLEANUP_LOCK.acquire(blocking=False):
            return False
        try:
            days = read_storage_settings(env).archive_after_days
            with self._mu:
                self._state = CleanState.RUNNING
                self._done = self._total = self._archived = self._freed = 0
            thread = threading.Thread(
                target=self._run, args=(Path(root), days, log), name=WORKER_THREAD_NAME, daemon=True,
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
                "archived": self._archived, "bytesFreed": self._freed,
            }

    def _run(self, root: Path, days: int | None, log: LogSink) -> None:
        try:
            self._isolated_pass(root, days, log)
        finally:
            CLEANUP_LOCK.release()

    def _isolated_pass(self, root: Path, days: int | None, log: LogSink) -> None:
        run_isolated(
            lambda: self._pass(root, days, log), label="storage clean now", log=log,
            on_error=lambda _exc: self._finish(CleanState.FAILED),
        )

    def _pass(self, root: Path, days: int | None, log: LogSink) -> None:
        now = datetime.now(timezone.utc)
        result = run_cleanup(root, now, warm_days=days, log=log, on_progress=self._on_progress)
        self._finish(CleanState.DONE, result)

    def _finish(self, state: CleanState, result: CleanupResult | None = None) -> None:
        with self._mu:
            self._state = state
            if result is not None:
                self._archived, self._freed = result.archived, result.bytes_freed

    def _on_progress(self, done: int, total: int) -> None:
        with self._mu:
            self._done, self._total = done, total
