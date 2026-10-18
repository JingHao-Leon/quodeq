"""Which finished runs a storage cleanup tidies and which it archives, decided without touching disk.

A run is touched only when its ``status.json`` is readable and in a terminal
state. Each project keeps its ``keep_runs`` newest done runs unpacked (the
warm set); every other finished run with an event log is archived, cancelled
and failed ones included. The newest finished run of each dimension (the one
the Overview reads) is tidied but never archived, and a project with a run
still in flight is left alone entirely. A run restored within the last
``RESTORE_GRACE_DAYS`` stays unpacked. A run without a start time, or bigger
than a restore accepts, is never archived. A run archived before its reports
were packed in place gets them packed by the next pass, without a restore. With
``cold_after_days`` set, an archived run that started earlier than that loses its
archive for good (``trim``) once it has frozen grades to stand in.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from quodeq.services.wiring import list_report_files
from quodeq.core.run.state import TERMINAL_STATES, RunState, parse_run_state
from quodeq.services.wiring import UnsupportedSchemaError, read_status
from quodeq.services.wiring_sync import (
    SCALARS_NAME, has_event_log, is_archived, is_cold, max_archive_bytes, packed_bytes, report_bytes, restored_at,
)


RESTORE_GRACE_DAYS = 30  # a run you opened stays unpacked this long


@dataclass(frozen=True)
class CleanupPlan:
    """Run folders to tidy, run folders to archive, and archived runs whose reports still wait to be packed."""

    tidy: tuple[Path, ...]
    archive: tuple[Path, ...]
    pack: tuple[Path, ...] = ()
    trim: tuple[Path, ...] = ()  # archived runs old enough to lose their findings for good


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
    return {dimension for dimension, _ in list_report_files(run_dir / "evaluation")}


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


def _warm_set(runs: list[tuple[Path, datetime | None, RunState]], keep_runs: int) -> set[Path]:
    """The project's *keep_runs* newest done runs with a start time."""
    done = sorted(((w, r) for r, w, s in runs if s == RunState.DONE and w is not None), reverse=True)
    return {r for _, r in done[:keep_runs]}


def _restored_recently(run_dir: Path, now: datetime) -> bool:
    restored = restored_at(run_dir)
    return restored is not None and restored >= now - timedelta(days=RESTORE_GRACE_DAYS)


def _trims(run_dir: Path, when: datetime | None, now: datetime, cold_after_days: int | None) -> bool:
    """An archived run old enough to lose its findings: not cold yet, with frozen grades to stand in."""
    if cold_after_days is None or when is None or is_cold(run_dir):
        return False
    return when < now - timedelta(days=cold_after_days) and (run_dir / SCALARS_NAME).is_file()


def _plan_project(project: Path, now: datetime, keep_runs: int | None, cold_after_days: int | None) -> CleanupPlan:
    runs: list[tuple[Path, datetime | None, RunState]] = []
    pack: list[Path] = []  # archived before the reports were packed in place (1.15.0): packed by the next pass
    trim: list[Path] = []
    for run_dir in _subdirs(project):
        state, when = read_run(run_dir)
        if _in_flight(run_dir, state):
            return CleanupPlan((), (), (), ())
        if is_archived(run_dir):
            if report_bytes(run_dir):
                pack.append(run_dir)
            if _trims(run_dir, when, now, cold_after_days):
                trim.append(run_dir)
        elif state in TERMINAL_STATES:
            runs.append((run_dir, when, state))
    tidy = [r for r, _, _ in runs]
    if keep_runs is None:
        return CleanupPlan(tuple(tidy), (), tuple(pack), tuple(trim))
    kept = _newest_per_dimension(runs) | _warm_set(runs, keep_runs)
    archive = [
        r for r, w, _ in runs
        if w is not None and r not in kept and has_event_log(r) and not _restored_recently(r, now)
    ]
    cap = max_archive_bytes()  # a run whose packed files pass the restore cap would never open again: it stays unpacked
    return CleanupPlan(tuple(tidy), tuple(r for r in archive if packed_bytes(r) <= cap), tuple(pack), tuple(trim))


def plan_cleanup(
    evaluations_root: Path | str, now: datetime, keep_runs: int | None, cold_after_days: int | None = None,
) -> CleanupPlan:
    """Decide which runs to tidy, archive, pack and trim, without touching disk.

    None *keep_runs*: tidy and pack only. None *cold_after_days*: trim nothing.
    """
    parts = [_plan_project(project, now, keep_runs, cold_after_days) for project in _subdirs(Path(evaluations_root))]
    return CleanupPlan(
        tuple(r for p in parts for r in p.tidy), tuple(r for p in parts for r in p.archive),
        tuple(r for p in parts for r in p.pack), tuple(r for p in parts for r in p.trim),
    )
