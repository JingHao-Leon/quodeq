"""Archived runs in the trend: served from their ``scalars.json``, never restored, never persisted.

The trend, the accumulated walk and the warm-up read every run of a project.
An archived run's findings are packed, so it cannot be rescored without a
restore, and a restore there would undo the archive for the whole history.
It is served instead from the grades it had when it was archived. A
suppression that touches it later (a dismissal made since, a deletion, a
rule) is applied once the run is opened and restored; the frozen rows are
served but never written to the score cache, so no persisted grade misses a
dismissal, and the first read after the restore rescores the run.
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable

from quodeq.core.observability import LogSink
from quodeq.core.types import DimensionResult
from quodeq.services._accumulated_data import read_scalar_dimensions
from quodeq.services.wiring_sync import is_archived
from quodeq.shared.validation import validate_path_segment

_Fetcher = Callable[[str], list[DimensionResult]]


def serve_archived_runs_frozen(
    reports_root: Path, project: str, fetch: _Fetcher, read_scalars: Callable[..., list[DimensionResult]],
    frozen: set[str], *, log: LogSink,
) -> _Fetcher:
    """*fetch* for live runs; an archived run's scalars otherwise, its id added to *frozen* (not to persist)."""
    project_dir = reports_root / project

    def fetch_run(run_id: str) -> list[DimensionResult]:
        validate_path_segment(run_id)
        if not is_archived(project_dir / run_id):
            return fetch(run_id)
        frozen.add(run_id)
        return read_scalar_dimensions(reports_root, project, run_id, scalar_reader=read_scalars, log=log)

    return fetch_run


def cacheable_unless_frozen(
    cacheable_run_ids: set[str] | None, frozen: set[str],
) -> Callable[[str], bool]:
    """The score cache's persist check: a terminal run (or any, without a list) that was not served frozen."""
    return lambda rid: rid not in frozen and (cacheable_run_ids is None or rid in cacheable_run_ids)
