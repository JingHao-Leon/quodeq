"""Fills History's per-run change cache: inline within a time budget, the rest on one worker.

A request computes missing entries until its budget runs out and hands the
remainder to a single background worker; the client polls until no run is
pending. Every computed entry is written to the score cache, so the next
request reads it. One run is computed at most once at a time (single-flight
per project and run id): a poll that lands while the worker is busy with a run
neither computes it again nor queues it twice.

The worker is a daemon thread started on demand that exits once the queue is
empty, not a ``ThreadPoolExecutor`` (its workers are non-daemon and would hold
the desktop window open on exit). Each queued run keeps the context of the
request that queued it, so a score-cache path override (a shared clone) still
routes the worker's writes.
"""
from __future__ import annotations

import contextvars
import sqlite3
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.services.wiring import open_score_cache, store_run_change
from quodeq.services.wiring_sync import score_cache_detached
from quodeq.shared.fault_isolation import run_isolated

WORKER_THREAD_NAME = "run-change-fill"
# Inline budget per request; past it the request answers with pending runs.
DEFAULT_BUDGET_S = 1.0

# The entry of a run whose change data could not be computed. It is cached
# like any other, so a malformed run is reported once, never pending forever;
# a new cache key (dismissal, rescore, new baseline) retries it.
FAILED_CHANGE: dict[str, Any] = {
    "counts": None, "newSev": None, "resolvedSev": None,
    "filesAnalysed": None, "activeSeconds": None, "failed": True,
}


@dataclass(frozen=True)
class ChangeJob:
    """One run whose change data is missing from the cache under *key*."""

    reports_root: Path
    project: str
    run_id: str
    baseline_id: str | None
    key: str


Compute = Callable[[ChangeJob], dict[str, Any]]
_Queued = tuple[contextvars.Context, ChangeJob, Compute]


class RunChangeFiller:
    """Computes and caches run change data within a budget, the rest in the background."""

    def __init__(
        self, budget_s: float = DEFAULT_BUDGET_S, *, log: LogSink = NULL_LOG,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._budget_s = budget_s
        self._log = log
        self._clock = clock
        self._cond = threading.Condition()
        self._in_flight: set[tuple[str, str]] = set()
        self._queue: deque[_Queued] = deque()
        self._worker_alive = False

    def fill(self, todo: list[ChangeJob], compute: Compute) -> dict[str, dict[str, Any]]:
        """Compute *todo* in order until the budget is spent; queue the rest.

        Returns the entries computed now, by run id. A run already in flight
        is skipped (it stays pending until the worker stores it).
        """
        deadline = self._clock() + self._budget_s
        done: dict[str, dict[str, Any]] = {}
        rest: list[ChangeJob] = []
        for job in todo:
            if rest or self._clock() >= deadline:
                rest.append(job)
            elif not self._is_in_flight(job):
                done[job.run_id] = self._compute_and_store(job, compute)
        self._enqueue(rest, compute)
        return done

    def pending(self, project: str) -> set[str]:
        """Run ids of *project* queued or being computed in the background."""
        with self._cond:
            return {run_id for p, run_id in self._in_flight if p == project}

    def wait_idle(self, timeout: float) -> bool:
        """Block until nothing is queued or running; False on timeout."""
        with self._cond:
            return self._cond.wait_for(lambda: not self._in_flight, timeout=timeout)

    def _is_in_flight(self, job: ChangeJob) -> bool:
        with self._cond:
            return (job.project, job.run_id) in self._in_flight

    def _isolated(self, job: ChangeJob, compute: Compute) -> dict[str, Any] | None:
        """*compute* for one run; a failure is logged and becomes ``FAILED_CHANGE``."""
        return run_isolated(
            lambda: compute(job), label=f"run change {job.project}/{job.run_id}", log=self._log,
            on_error=lambda _exc: dict(FAILED_CHANGE),
        )

    def _compute_and_store(self, job: ChangeJob, compute: Compute) -> dict[str, Any]:
        entry = self._isolated(job, compute)
        if entry is None:
            entry = dict(FAILED_CHANGE)
        try:
            with open_score_cache() as conn:
                store_run_change(conn, job.project, job.run_id, job.key, entry)
        except (sqlite3.Error, OSError) as exc:
            self._log.warning(f"run change cache unavailable for {job.project}/{job.run_id}: {exc}")
        return entry

    def _enqueue(self, jobs: list[ChangeJob], compute: Compute) -> None:
        if not jobs:
            return
        context = contextvars.copy_context()
        start = False
        with self._cond:
            for job in jobs:
                ident = (job.project, job.run_id)
                if ident in self._in_flight:
                    continue
                self._in_flight.add(ident)
                self._queue.append((context, job, compute))
            if self._queue and not self._worker_alive:
                self._worker_alive = start = True
        if start:
            self._start_worker()

    def _start_worker(self) -> None:
        try:
            threading.Thread(target=self._work, name=WORKER_THREAD_NAME, daemon=True).start()
        except RuntimeError as exc:
            # No thread: drop the queue so its runs are not pending forever;
            # the next request queues them again.
            with self._cond:
                self._stop_locked()
            self._log.warning(f"run change worker failed to start: {exc}")

    def _stop_locked(self) -> None:
        """Mark the worker gone and release every queued run. Caller holds the lock."""
        for _context, job, _compute in self._queue:
            self._in_flight.discard((job.project, job.run_id))
        self._queue.clear()
        self._worker_alive = False
        self._cond.notify_all()

    def _next(self) -> _Queued | None:
        """The next queued run; None (and the worker marked gone, atomically) when empty."""
        with self._cond:
            if not self._queue:
                self._stop_locked()
                return None
            return self._queue.popleft()

    def _release(self, job: ChangeJob) -> None:
        with self._cond:
            self._in_flight.discard((job.project, job.run_id))
            self._cond.notify_all()

    def _detached(self, job: ChangeJob, compute: Compute) -> None:
        """Compute and store off the request: never on the request's session connection."""
        with score_cache_detached():
            self._compute_and_store(job, compute)

    def _work(self) -> None:
        # A run's failure is isolated and logged; anything that still ends
        # the loop early marks the worker gone and releases the current and
        # queued runs, so nothing stays pending and the next request can
        # start a worker again.
        job: ChangeJob | None = None
        drained = False
        try:
            while (item := self._next()) is not None:
                context, job, compute = item
                run_isolated(
                    lambda: context.run(self._detached, job, compute),
                    label=f"run change worker {job.project}/{job.run_id}", log=self._log,
                )
                self._release(job)
                job = None
            drained = True
        finally:
            if not drained:
                with self._cond:
                    if job is not None:
                        self._in_flight.discard((job.project, job.run_id))
                    self._stop_locked()
