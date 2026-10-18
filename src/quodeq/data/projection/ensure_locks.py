"""Per-run locks that serialise ``ensure_projected`` across threads, and know which thread holds them."""
from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


class EnsureLockRegistry:
    """Per-run-dir locks serializing ``ensure_projected``.

    Entries are refcounted: a lock is created on first ``acquire()`` for a
    run_dir and removed once the last concurrent caller for that run_dir
    releases it. This bounds the registry to run_dirs CURRENTLY being
    projected, instead of growing one entry per run_dir ever seen for the
    life of a long-lived API/dashboard process. The default registry below
    is process-wide on purpose — concurrent callers projecting the same run
    must share one lock. Tests inject a fresh registry so lock state never
    leaks between them.
    """

    def __init__(self) -> None:
        self._locks: dict[Path, threading.Lock] = {}
        self._refcounts: dict[Path, int] = {}
        self._owners: dict[Path, int] = {}  # run_dir -> ident of the thread holding its lock
        self._registry_lock = threading.Lock()

    def held_by_this_thread(self, run_dir: Path) -> bool:
        """True while the calling thread holds the lock for *run_dir* (a nested ``ensure_projected``)."""
        with self._registry_lock:
            return self._owners.get(run_dir) == threading.get_ident()

    @contextmanager
    def acquire(self, run_dir: Path) -> Iterator[None]:
        """Hold the lock for *run_dir* for the duration of the block.

        Blocks while another thread projects the same run. The refcount is
        bumped under the registry lock before blocking, so the entry cannot be
        evicted out from under a waiter.
        """
        with self._registry_lock:
            lock = self._locks.get(run_dir)
            if lock is None:
                lock = threading.Lock()
                self._locks[run_dir] = lock
                self._refcounts[run_dir] = 0
            self._refcounts[run_dir] += 1
        lock.acquire()
        with self._registry_lock:
            self._owners[run_dir] = threading.get_ident()
        try:
            yield
        finally:
            with self._registry_lock:
                self._owners.pop(run_dir, None)
            lock.release()
            with self._registry_lock:
                self._refcounts[run_dir] -= 1
                if self._refcounts[run_dir] == 0:
                    del self._locks[run_dir]
                    del self._refcounts[run_dir]
