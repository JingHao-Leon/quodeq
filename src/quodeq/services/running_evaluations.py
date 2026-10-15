"""Evaluations in progress right now, read straight from the reports dir.

For ``quodeq status``, which has to answer even when no API is up: every
run writes a ``.pid`` file at start and keeps it after it ends, so a run
counts only when its ``status.json`` is not final *and* that PID still runs
an ``evaluate`` command (the OS reuses the PIDs of finished runs).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from quodeq.core.run.state import TERMINAL_STATES
from quodeq.services.wiring import read_repository_info, read_run_status_json
from quodeq.shared.process import process_has_arg

# `quodeq evaluate ...` from a terminal and the dashboard's `-m quodeq.cli evaluate ...`
_EVALUATE_ARG = "evaluate"
_SECONDS_PER_MINUTE = 60
_MINUTES_PER_HOUR = 60


@dataclass(frozen=True)
class RunningEvaluation:
    """One evaluation in progress."""

    project: str
    pid: int
    dimensions: list[str]
    running_for: str  # "12m" / "2h 5m", or "" when the start time is unknown


def _read_pid(pid_file: Path) -> int | None:
    try:
        raw = pid_file.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return int(raw) if raw.isdigit() else None


def _running_for(started_at: object) -> str:
    try:
        started = datetime.fromisoformat(str(started_at))
    except ValueError:
        return ""
    if started.tzinfo is None:
        return ""
    minutes = int((datetime.now(timezone.utc) - started).total_seconds() // _SECONDS_PER_MINUTE)
    hours, minutes = divmod(minutes, _MINUTES_PER_HOUR)
    return f"{hours}h {minutes}m" if hours else f"{minutes}m"


def running_evaluations(evaluations_dir: Path) -> list[RunningEvaluation]:
    """Every run under *evaluations_dir* that is still in progress."""
    runs = []
    for pid_file in sorted(evaluations_dir.glob("*/*/.pid")):
        run_dir = pid_file.parent
        status = read_run_status_json(run_dir)
        if not status or status.get("state") in TERMINAL_STATES:
            continue
        pid = _read_pid(pid_file)
        if pid is None or not process_has_arg(pid, _EVALUATE_ARG):
            continue
        info = read_repository_info(run_dir.parent) or {}
        runs.append(RunningEvaluation(
            project=str(info.get("name") or run_dir.parent.name),
            pid=pid,
            dimensions=[str(d) for d in status.get("dimensions") or []],
            running_for=_running_for(status.get("started_at")),
        ))
    return runs
