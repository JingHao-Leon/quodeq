"""The run index at one path, for callers above the data layer.

Every method opens the index, does its work and closes it, so callers never
hold or close a connection. :meth:`RunIndexStore.session` serves the few
compound steps that need several index calls over one connection. Index
functions are looked up on the ``run_index`` module at call time, so a test
patching one of them reaches these methods too.
"""
from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from quodeq.data.sqlite import run_index as _run_index
from quodeq.data.sqlite.index_sync import force_promote_to_cancelled_stale


class RunIndexStore:
    """Reads and writes of the run index at *path*, each over its own connection."""

    def __init__(self, path: Path) -> None:
        self._path = Path(path)

    @contextmanager
    def session(self) -> Iterator[sqlite3.Connection]:
        """One open index connection for a compound step; closed on exit."""
        db = _run_index.open_index(self._path)
        try:
            yield db
        finally:
            db.close()

    def synced_runs(
        self, reports_dir: Path, *, limit: int | None, states: set[str] | None,
    ) -> list[_run_index.RunRow]:
        """Sync the index against *reports_dir*, then up to *limit* rows (None: all) in *states*."""
        with self.session() as db:
            _run_index.sync_index(db, reports_dir)
            return _run_index.list_runs(db, limit=limit, states=states or None)

    def synced_project_runs(self, reports_root: Path, project: str) -> list[_run_index.RunRow]:
        """Sync only *project*'s run dirs, then all of its rows."""
        with self.session() as db:
            _run_index.sync_project(db, reports_root / project, project)
            return _run_index.list_runs_for_project(db, project, limit=None)

    def get(self, job_id: str) -> _run_index.RunRow | None:
        """The row for *job_id* as indexed now, without syncing."""
        with self.session() as db:
            return _run_index.get_run(db, job_id)

    def delete(self, *job_ids: str) -> None:
        """Drop the rows of *job_ids*; ids with no row are ignored."""
        with self.session() as db:
            for job_id in job_ids:
                _run_index.delete_run(db, job_id)

    def promote_to_cancelled_stale(self, job_id: str, *, run_dir: Path | None) -> bool:
        """Force a stuck running row to ``cancelled(stale_detected)``; see ``index_sync``."""
        with self.session() as db:
            return force_promote_to_cancelled_stale(db, job_id, run_dir=run_dir)

    def rebuild(self, reports_root: Path) -> tuple[int, int]:
        """Rebuild the index from *reports_root*: ``(rows_written, elapsed_ms)``."""
        with self.session() as db:
            return _run_index.rebuild_index(db, reports_root)
