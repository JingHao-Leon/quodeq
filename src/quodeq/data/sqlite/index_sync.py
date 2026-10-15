"""Internal sync logic for the SQLite run index.

Upserts rows from status.json, or synthesizes from legacy filesystem
signals for runs old enough to predate it. Promotes stale non-terminal runs to
cancelled based on heartbeat mtime + PID liveness.
"""
from __future__ import annotations

import dataclasses
import json
import logging
import sqlite3
import time
from pathlib import Path

from quodeq.core.run.exit_reason import ExitReason
from quodeq.core.run.job_status import external_job_id
from quodeq.shared.clock import utc_iso_from_epoch
from quodeq.shared.constants import EVIDENCE_DIRNAME, MANIFEST_FILENAME
from quodeq.shared.process import is_original_process, is_pid_alive as _is_pid_alive
from quodeq.shared.run_heartbeat import HEARTBEAT_FILENAME
from quodeq.data.fs.run_status_store import (
    RunState,
    RunStatus,
    STATUS_FILENAME,
    TERMINAL_STATES,
    UnsupportedSchemaError,
    read_status,
    write_status,
)
from quodeq.data.sqlite._index_sync_promote import (
    force_promote_to_cancelled_stale,  # noqa: F401 — re-export
)

logger = logging.getLogger(__name__)

_KNOWN_STATE_VALUES = {s.value for s in RunState}
_DEFAULT_STALE_SECONDS = 30  # check_stale_and_promote's heartbeat-staleness threshold

_UPSERT_SQL = """
INSERT INTO runs (
    job_id, project_uuid, run_id, run_dir, state, phase, current_dimension,
    started_at, updated_at, finalized_at, heartbeat_at, pid, exit_reason, status_mtime,
    ai_model, ai_provider, commit_sha, origin_json, dimensions_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(job_id) DO UPDATE SET
    project_uuid=excluded.project_uuid,
    run_id=excluded.run_id,
    run_dir=excluded.run_dir,
    state=excluded.state,
    phase=excluded.phase,
    current_dimension=excluded.current_dimension,
    started_at=excluded.started_at,
    updated_at=excluded.updated_at,
    finalized_at=excluded.finalized_at,
    heartbeat_at=excluded.heartbeat_at,
    pid=excluded.pid,
    exit_reason=excluded.exit_reason,
    status_mtime=excluded.status_mtime,
    ai_model=excluded.ai_model,
    ai_provider=excluded.ai_provider,
    commit_sha=excluded.commit_sha,
    origin_json=excluded.origin_json,
    dimensions_json=excluded.dimensions_json
"""


def _run_pid_alive(run_dir: Path, pid: int) -> bool:
    """True while *pid* is still the run's own process, not a reuse of its number.

    The run writes ``.pid`` from inside that process, so a live *pid* that
    started after the file was written got the number once the run ended.
    No ``.pid`` naming the same pid (legacy runs) leaves liveness alone.
    """
    pid_path = run_dir / ".pid"
    try:
        recorded = int(pid_path.read_text(encoding="utf-8").strip())
        written_at = pid_path.stat().st_mtime
    except (OSError, ValueError):
        return _is_pid_alive(pid)
    if recorded != pid:
        return _is_pid_alive(pid)
    return is_original_process(pid, written_at)


def _heartbeat_mtime(run_dir: Path) -> float | None:
    path = run_dir / HEARTBEAT_FILENAME
    try:
        return path.stat().st_mtime
    except OSError:
        return None


def _heartbeat_iso(run_dir: Path) -> str | None:
    m = _heartbeat_mtime(run_dir)
    if m is None:
        return None
    return utc_iso_from_epoch(m)


def status_mtime_ns(run_dir: Path) -> int:
    """The run's status.json mtime in nanoseconds, or 0 when it is missing."""
    try:
        return (run_dir / STATUS_FILENAME).stat().st_mtime_ns
    except OSError:
        return 0


def _str_or_none(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _meta_params(status: dict) -> tuple[str | None, ...]:
    """The run metadata columns, in ``_UPSERT_SQL`` order.

    A hand-edited or foreign status.json may hold any JSON type here; a value
    of the wrong type becomes NULL rather than failing the upsert, which would
    drop the whole run from the index.
    """
    origin = status.get("origin")
    dims = status.get("dimensions")
    names = sorted(d for d in dims if isinstance(d, str)) if isinstance(dims, list) else []
    return (
        _str_or_none(status.get("ai_model")),
        _str_or_none(status.get("ai_provider")),
        _str_or_none(status.get("commit_sha")),
        json.dumps(origin) if isinstance(origin, dict) else None,
        json.dumps(names) if names else None,
    )


def upsert_from_status(
    db: sqlite3.Connection, run_dir: Path, *, project_uuid: str, run_id: str,
) -> None:
    """Read status.json + heartbeat, upsert the row."""
    try:
        status = read_status(run_dir)
    except UnsupportedSchemaError:
        logger.warning("skipping run %s: status schema newer than supported", run_dir)
        return
    if status is None:
        return
    job_id = status.get("job_id") or external_job_id(run_id)
    db.execute(
        _UPSERT_SQL,
        (
            job_id,
            project_uuid,
            run_id,
            str(run_dir),
            status.get("state", RunState.RUNNING),
            status.get("phase"),
            status.get("current_dimension"),
            status.get("started_at", ""),
            status.get("updated_at", ""),
            status.get("finalized_at"),
            _heartbeat_iso(run_dir),
            status.get("pid"),
            status.get("exit_reason"),
            status_mtime_ns(run_dir),
            *_meta_params(status),
        ),
    )


def sync_legacy_run(
    db: sqlite3.Connection, run_dir: Path, *, project_uuid: str, run_id: str,
) -> None:
    """Synthesize a row from filesystem signals for a run with no status.json."""
    scan_path = run_dir / "scan.json"
    pid_path = run_dir / ".pid"
    manifest_path = run_dir / EVIDENCE_DIRNAME / MANIFEST_FILENAME
    if not manifest_path.exists():
        return  # not a real run

    state: str
    exit_reason: str | None

    if scan_path.exists():
        state, exit_reason = RunState.DONE, None
    elif pid_path.exists():
        try:
            pid = int(pid_path.read_text(encoding="utf-8").strip())
            alive = is_original_process(pid, pid_path.stat().st_mtime)
        except (OSError, ValueError):
            alive = False
        if alive:
            state, exit_reason = RunState.RUNNING, None
        else:
            state, exit_reason = RunState.CANCELLED, ExitReason.STALE_LEGACY_PID_DEAD
    else:
        state, exit_reason = RunState.CANCELLED, ExitReason.STALE_LEGACY_NO_PID

    job_id = external_job_id(run_id)
    try:
        started_ts = manifest_path.stat().st_mtime
    except OSError:
        started_ts = time.time()
    started_iso = utc_iso_from_epoch(started_ts)

    db.execute(
        _UPSERT_SQL,
        (
            job_id, project_uuid, run_id, str(run_dir),
            state, None, None,
            started_iso, started_iso, started_iso if state in TERMINAL_STATES else None,
            None, None, exit_reason,
            0,
            None, None, None, None, None,
        ),
    )


def delete_orphan_non_terminal_rows(db: sqlite3.Connection) -> int:
    """Remove non-terminal rows whose ``run_dir`` no longer exists on disk.

    Without this sweep, an orphan row (e.g. left by a crashed test, a manually
    deleted run dir, or a partial cleanup) stays as ``running`` forever:
    ``check_stale_and_promote`` reads ``.heartbeat`` from ``run_dir``, and an
    unreadable heartbeat (no dir) provides no liveness signal, so the row is
    never promoted. Terminal rows are left alone — users may prune old dirs
    to save disk and the index is their only record.
    """
    placeholders = ", ".join("?" for _ in TERMINAL_STATES)
    rows = db.execute(
        f"SELECT job_id, run_dir FROM runs WHERE state NOT IN ({placeholders})",
        tuple(TERMINAL_STATES),
    ).fetchall()
    orphan_ids = [job_id for job_id, run_dir in rows if not Path(run_dir).is_dir()]
    if not orphan_ids:
        return 0
    db.executemany("DELETE FROM runs WHERE job_id = ?", [(j,) for j in orphan_ids])
    return len(orphan_ids)


def check_stale_and_promote(
    db: sqlite3.Connection, run_dir: Path, *,
    project_uuid: str, run_id: str, stale_seconds: int = _DEFAULT_STALE_SECONDS,
) -> bool:
    """Promote non-terminal runs with dead heartbeat + dead PID to cancelled.

    Returns True if a promotion occurred. Writes status.json back to disk
    (via run_status.write_status) so the terminal state is durable across
    dashboard sessions.
    """
    try:
        status = read_status(run_dir)
    except UnsupportedSchemaError:
        return False
    if status is None:
        return False
    state = status.get("state")
    if state in TERMINAL_STATES:
        return False

    heartbeat_mtime = _heartbeat_mtime(run_dir)
    heartbeat_stale = heartbeat_mtime is None or (time.time() - heartbeat_mtime) > stale_seconds

    pid = status.get("pid")
    pid_alive = isinstance(pid, int) and _run_pid_alive(run_dir, pid)

    if heartbeat_stale and not pid_alive:
        # from_status_dict needs a known "state"; fall back if status.json
        # omits it, or holds a value that isn't a valid RunState (either way
        # discarded by the override below). deadline_at/ai_provider/ai_model
        # carry forward unchanged, so the dashboard and filesystem snapshot
        # builder keep seeing them.
        if status.get("state") not in _KNOWN_STATE_VALUES:
            status["state"] = RunState.RUNNING.value
        base = RunStatus.from_status_dict(status)
        new_status = dataclasses.replace(
            base,
            state=RunState.CANCELLED,
            job_id=status.get("job_id", external_job_id(run_id)),
            pid=pid if isinstance(pid, int) else None,
            exit_reason=ExitReason.STALE_DETECTED,
            finalized_at=None,
            time_limit_s=None,
        )
        write_status(run_dir, new_status)
        with db:
            upsert_from_status(db, run_dir, project_uuid=project_uuid, run_id=run_id)
        return True

    return False
