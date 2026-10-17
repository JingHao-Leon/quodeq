"""The run log's entries for cancelled runs, memoized in process.

A cancelled run is not a settled history point, so the shared score cache does
not persist its rows and building its entry rescores it from evidence. The run
log polls, so the built entries are kept here, keyed by everything they depend
on: the project's suppression/params/standards version and, per cancelled run,
the names and mtimes of its evaluation reports (a later-scored dimension adds
or touches one).
"""
from __future__ import annotations

import threading
from collections import OrderedDict
from pathlib import Path
from typing import Any

from quodeq.core.run.state import RunState
from quodeq.services.dashboard_trend import build_partial_run_entries
from quodeq.services.scoring import ProjectRows

# Projects whose partial entries are remembered; the least recently used one is dropped.
_MAX_PROJECTS = 16
_REPORT_GLOB = "*.json"
_REPORT_DIR = "evaluation"

_Key = tuple[Any, ...]
_lock = threading.Lock()
_memo: OrderedDict[str, tuple[_Key, list[dict[str, Any]]]] = OrderedDict()


def _report_stamps(run_dir: Path) -> tuple[tuple[str, int], ...]:
    try:
        return tuple(sorted((p.name, p.stat().st_mtime_ns) for p in (run_dir / _REPORT_DIR).glob(_REPORT_GLOB)))
    except OSError:
        return ()


def partial_entries(rows: ProjectRows, cancelled: list, version: str) -> list[dict[str, Any]]:
    """Entries for *cancelled* runs that scored a dimension, rebuilt only when their inputs changed.

    *version* is the project's score cache version, read once per request by the caller.
    """
    project_dir = rows.reports_root / rows.project
    key: _Key = (
        str(rows.reports_root),
        version,
        tuple((r.run_id, _report_stamps(project_dir / r.run_id)) for r in cancelled if r.status is RunState.CANCELLED),
    )
    with _lock:
        hit = _memo.get(rows.project)
        if hit is not None and hit[0] == key:
            _memo.move_to_end(rows.project)
            return [dict(e) for e in hit[1]]
    entries = build_partial_run_entries(cancelled, rows.fetcher, params=rows.params)
    with _lock:
        _memo[rows.project] = (key, entries)
        _memo.move_to_end(rows.project)
        while len(_memo) > _MAX_PROJECTS:
            _memo.popitem(last=False)
    return [dict(e) for e in entries]


def clear_partial_memo() -> None:
    """Forget every remembered entry (tests)."""
    with _lock:
        _memo.clear()
