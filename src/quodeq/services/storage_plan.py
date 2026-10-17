"""Which finished runs a storage cleanup tidies and which it archives, decided without touching disk.

A run is touched only when its ``status.json`` is readable and in a terminal
state. The newest finished run of each dimension (the one the Overview
reads) is tidied but never archived, and a project with a run still in
flight is left alone entirely. A restored run counts as touched when it was
restored, so it stays warm for the window. A run bigger than a restore
accepts is never archived.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from quodeq.core.run.state import TERMINAL_STATES, RunState, parse_run_state
from quodeq.services.wiring import UnsupportedSchemaError, read_status
from quodeq.services.wiring_sync import has_event_log, is_archived, max_archive_bytes, packable_bytes, restored_at


@dataclass(frozen=True)
class CleanupPlan:
    """Run folders to tidy and run folders to archive."""

    tidy: tuple[Path, ...]
    archive: tuple[Path, ...]


def read_run(run_dir: Path) -> tuple[RunState | None, datetime | None]:
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
    return any(_in_flight(run_dir, read_run(run_dir)[0]) for run_dir in _subdirs(project))


def _last_touched(run_dir: Path, started: datetime) -> datetime:
    """The later of the run's start and its last restore."""
    restored = restored_at(run_dir)
    return max(started, restored) if restored is not None else started


def _plan_project(project: Path, now: datetime, warm_days: int | None) -> tuple[list[Path], list[Path]]:
    runs: list[tuple[Path, datetime | None, RunState]] = []
    for run_dir in _subdirs(project):
        state, when = read_run(run_dir)
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
    cap = max_archive_bytes()  # a run past the restore cap would never open again: it stays unpacked
    return tidy, [r for r in archive if packable_bytes(r) <= cap]


def plan_cleanup(evaluations_root: Path | str, now: datetime, warm_days: int | None) -> CleanupPlan:
    """Decide which runs to tidy and which to archive, without touching disk. None warm_days: tidy only."""
    tidy: list[Path] = []
    archive: list[Path] = []
    for project in _subdirs(Path(evaluations_root)):
        t, a = _plan_project(project, now, warm_days)
        tidy += t
        archive += a
    return CleanupPlan(tuple(tidy), tuple(archive))
