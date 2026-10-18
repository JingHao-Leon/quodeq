"""Run discovery, date parsing, and report aggregation for filesystem reports.

The module-level functions (``read_run_data``, ``list_runs``, etc.) are the
filesystem implementation — there is no ``RunStorage`` protocol here. A
caller that needs a substitute injects a reader callable instead: see
``ScoringDeps.read_run_data`` (``services/scoring_deps.py``) and
``trend_fetcher._default_read_run_scalars``.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from quodeq.core.run.state import TERMINAL_STATES, RunState, parse_run_state
from quodeq.core.utils.io import resolve_child_dir
from quodeq.core.types import DimensionResult
from quodeq.data.mappers import parse_dimension_result
from quodeq.data.sqlite.dimension_counts import read_dimension_counts
from quodeq.data.fs.report_parser._evaluations import load_evaluations
from quodeq.data.fs.report_parser.external_pid import resolve_external_pid
from quodeq.data.fs.report_parser._evidence import load_evidence_map
from quodeq.data.fs.report_parser._evidence_sqlite import has_evaluation_db, manifest_metadata
from quodeq.data.fs.report_parser._run_scalars import scalars_to_dimension_results
from quodeq.shared.constants import EVIDENCE_DIRNAME, MANIFEST_FILENAME
from quodeq.data.fs.report_parser._repository import (
    build_repository_info as build_repository_info,
)
from quodeq.data.fs.report_parser._run_info import (
    RunInfo as RunInfo,
    parse_run_date,
    safe_read_dir as safe_read_dir,
)
from quodeq.data.fs.report_parser.run_dates import remember_run_dates, remembered_run_dates
from quodeq.data.fs.run_archive import restore_or_warn
from quodeq.data.fs.run_cold import is_cold, is_frozen
from quodeq.data.fs.report_files import list_report_files
from quodeq.data.fs.run_scalars import read_scalars
from quodeq.shared.validation import validate_path_segment

_DEFAULT_RUN_LIMIT = 100


def read_run_data(reports_root: Path, project: str, run_id: str) -> list[DimensionResult]:
    """Load all dimension evaluations and evidence for a single run.

    Example::

        dims = read_run_data(Path("/reports"), "my-project", "20260301")
    """
    validate_path_segment(project, run_id)
    # Resolve both segments by listing rather than joining, so neither name
    # is ever concatenated onto a path. A miss raises the same
    # FileNotFoundError callers already handle for an absent run.
    project_dir = resolve_child_dir(reports_root, project)
    resolved_run = resolve_child_dir(project_dir, run_id) if project_dir else None
    if resolved_run is None:
        raise FileNotFoundError(f"Run not found: {project}/{run_id}")
    run_dir = Path(resolved_run)
    if is_cold(run_dir):  # nothing to restore: the reports with the frozen grades are all there is
        return read_archived_run_data(run_dir)
    restore_or_warn(run_dir)  # the evidence read below needs an archived run's database back
    dimensions = _report_dimensions(run_dir, load_evidence_map(run_dir / EVIDENCE_DIRNAME))
    # For event-log runs, the SQL grade tables (rewritten on dismiss and on a
    # grade-formula Apply) are the source of truth; overlay them so every
    # read-side consumer — run detail, accumulated overview, trend, project
    # cards — agrees with the run-detail SQL grades. Legacy runs (no
    # events.jsonl) keep their frozen eval-time grades.
    from quodeq.data.fs.report_parser._sql_grade_overlay import (  # noqa: PLC0415
        overlay_sql_grades,
    )
    return overlay_sql_grades(run_dir, dimensions)


def _default_fallback_reader(reports_root: Path, project: str, run_id: str) -> list[DimensionResult]:
    """Default ``read_run_scalars`` fallback: a thin wrapper around
    ``read_run_data``, resolved by name at call time (not captured directly
    as the default value) so a caller two layers up that still patches this
    module's ``read_run_data`` attribute (rather than injecting
    ``fallback_reader``) keeps intercepting the fallback path.
    """
    return read_run_data(reports_root, project, run_id)


def _read_run_scalars_from_sql(run_dir: Path) -> "tuple[list[dict], list[dict]] | None":
    """Read dimension/principle grade rows straight from evaluation.db.

    Returns None whenever the SQL tables can't faithfully reproduce the
    overlaid result: legacy run (no ``events.jsonl``) or no
    ``evaluation.db``; SQLite disabled or db unreadable; empty grade
    tables; a NULL SQL score (overlay would keep the eval-time score); or
    the SQL dim count != the on-disk ``evaluation/*.json`` count (partial
    projection). None signals the caller to use its fallback reader.
    """
    from quodeq.data.fs.run_archive import has_event_log  # noqa: PLC0415
    from quodeq.shared.env import sqlite_disabled  # noqa: PLC0415

    # An archived run never comes here (read_archived_run_scalars); one
    # archived after that check is restored by ensure_projected, a rare race.
    if sqlite_disabled() or not has_event_log(run_dir) or not has_evaluation_db(run_dir):
        return None

    import sqlite3  # noqa: PLC0415

    from quodeq.data.sqlite.findings_repository import SqliteFindingsRepository  # noqa: PLC0415
    from quodeq.data.sqlite.state_store import SQLiteStateStore  # noqa: PLC0415

    try:
        SqliteFindingsRepository(run_dir).ensure_projected()
        store = SQLiteStateStore(run_dir)
        dim_rows = store.read_dimension_scores()
        principle_rows = store.read_principle_grades()
        counts = read_dimension_counts(run_dir)
    except (sqlite3.DatabaseError, FileNotFoundError):  # FileNotFoundError: log archived mid-read
        return None

    if not dim_rows:
        return None

    if any(r.get("score") is None for r in dim_rows):
        return None

    on_disk = len(list_report_files(run_dir / "evaluation"))
    if on_disk and len(dim_rows) != on_disk:
        return None

    return dim_rows, principle_rows, counts


def read_run_scalars(
    reports_root: Path,
    project: str,
    run_id: str,
    *,
    fallback_reader: Callable[[Path, str, str], list[DimensionResult]] = _default_fallback_reader,
) -> list[DimensionResult]:
    """Load a run's per-dimension scalars: everything a full read carries but the findings.

    Fast path for the trend, the accumulated walk and the Compare screen,
    which never list findings. Reads the authoritative SQL grade tables
    directly instead of parsing the evaluation JSON, plus the run manifest
    for the run-level metadata, then falls back to *fallback_reader*
    (defaults to :func:`read_run_data`) whenever the SQL tables can't
    faithfully reproduce the overlaid result -- see
    :func:`_read_run_scalars_from_sql` for the full list of guards.

    Not available without the report: ``evidence_date`` (the run's date,
    which ``RunInfo`` carries) and ``quarantined_count`` (0 here).
    """
    validate_path_segment(project, run_id)
    run_dir = reports_root / project / run_id
    if is_frozen(run_dir):
        return read_archived_run_scalars(run_dir)

    sql_result = _read_run_scalars_from_sql(run_dir)
    if sql_result is None:
        return fallback_reader(reports_root, project, run_id)
    dim_rows, principle_rows, counts = sql_result
    return scalars_to_dimension_results(dim_rows, principle_rows, counts, manifest_metadata(run_dir))


def read_archived_run_data(run_dir: Path) -> list[DimensionResult]:
    """An archived run's reports with the grades of its ``scalars.json``, without restoring it.

    What the walks that would read a run in full get for an archived run:
    the findings stay packed, so only the reports' bodies come back. With no
    sidecar the reports' eval-time grades stand, as for a legacy run.
    """
    from quodeq.data.fs.report_parser._sql_grade_overlay import overlay_grade_rows  # noqa: PLC0415

    # A database beside an archive is a stray; opening it would restore the run.
    evidence = {} if has_evaluation_db(run_dir) else load_evidence_map(run_dir / EVIDENCE_DIRNAME)
    dimensions = _report_dimensions(run_dir, evidence)
    frozen = read_scalars(run_dir)
    return overlay_grade_rows(dimensions, frozen[0], frozen[1]) if frozen else dimensions


def read_archived_run_scalars(run_dir: Path) -> list[DimensionResult]:
    """An archived run's scalars without restoring it: ``scalars.json``, else its reports.

    The routine readers (run list, trend, warm-up, accumulated walk) come here
    for every run of a project; a restore would undo the archive. The sidecar
    holds what the grade tables held at archive time. An archive written
    before the sidecar existed reads like a legacy run: the eval-time grades
    of its reports, without counts.
    """
    frozen = read_scalars(run_dir)
    if frozen is not None:
        return scalars_to_dimension_results(*frozen, manifest_metadata(run_dir))
    return read_archived_run_data(run_dir)


def _report_dimensions(run_dir: Path, evidence_map: dict) -> list[DimensionResult]:
    """The run's evaluation reports merged with their evidence metadata, sorted by dimension."""
    dimensions: list[DimensionResult] = []
    for evaluation in load_evaluations(run_dir / "evaluation"):
        evidence = evidence_map.get(evaluation.get("dimension"), {})
        dimensions.append(parse_dimension_result({
            **evaluation,
            "sourceFileCount": evidence.get("sourceFileCount"),
            "evidenceDate": evidence.get("date"),
            "discipline": evidence.get("discipline"),
        }))
    dimensions.sort(key=lambda item: item.dimension)
    return dimensions


def _read_run_status(run_dir: Path) -> str | None:
    """Read state from status.json if present. Returns the state string or None."""
    import json as _json  # noqa: PLC0415
    status_path = run_dir / "status.json"
    if not status_path.is_file():
        return None
    try:
        with status_path.open("r", encoding="utf-8") as fp:
            data = _json.load(fp)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    state = data.get("state")
    return state if isinstance(state, str) else None


def _run_status_for_entry(project_dir: Path, run_dir: Path, entry_name: str) -> RunState:
    """Status precedence for one run dir entry:

    1. status.json state is terminal -> honor it, even over a still-live
       PID (a cancelled run keeps draining after its state flips; it must
       not resurface as running).
    2. Live process holding the PID -> RUNNING.
    3. Otherwise -> DONE (historical, crashed, pre-.pid-era runs).
    """
    raw_state = _read_run_status(run_dir)
    if raw_state:
        try:
            state = parse_run_state(raw_state)
        except ValueError:
            state = None
        if state in TERMINAL_STATES:
            return state
    pid = resolve_external_pid(project_dir, entry_name)
    return RunState.RUNNING if pid is not None else RunState.DONE


def list_runs(reports_root: Path, project: str, *, limit: int = _DEFAULT_RUN_LIMIT) -> list[RunInfo]:
    """Return runs for a project, sorted newest-first by date.

    When *limit* > 0 only the most recent *limit* runs are returned.

    Example::

        runs = list_runs(Path("/reports"), "my-project", limit=5)
    """
    validate_path_segment(project)
    # Resolve by listing, not by joining: the returned path comes from the
    # directory enumeration, so *project* is only ever compared. No project
    # directory means no runs, which is what a bad name produces too.
    resolved = resolve_child_dir(reports_root, project)
    if resolved is None:
        return []
    project_dir = Path(resolved)
    index_dates = remembered_run_dates(reports_root, project)
    parsed: dict[str, tuple[str | None, str]] = {}
    run_infos: list[RunInfo] = []
    for entry in safe_read_dir(project_dir):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        run_dir = Path(entry.path)
        # A run is real when it has a manifest OR a status.json. Runs started
        # without a prescan never write evidence/manifest.json, and the SQLite
        # index (History) already accepts any run with a status.json — the two
        # enumerators must agree or the Overview 404s on runs History shows.
        is_run = (run_dir / EVIDENCE_DIRNAME / MANIFEST_FILENAME).exists() \
            or (run_dir / "status.json").is_file()
        if not is_run:
            continue
        status = _run_status_for_entry(project_dir, run_dir, entry.name)
        cached = index_dates.get(entry.name)
        if cached is not None:
            date_iso, date_label = cached
        else:
            date_iso, date_label = parse_run_date(reports_root, project, entry.name)
            # Remembered so this read happens once. An undated run is parsed
            # again while it runs (a report may still bring a date) and
            # remembered as undated once it has finished.
            if date_iso is not None or status in TERMINAL_STATES:
                parsed[entry.name] = (date_iso, date_label)
        run_infos.append(RunInfo(run_id=entry.name, date_iso=date_iso, date_label=date_label, status=status))
    remember_run_dates(project, parsed)
    run_infos.sort(key=lambda r: (r.date_iso or "", r.run_id), reverse=True)
    if limit > 0:
        return run_infos[:limit]
    return run_infos
