"""The grade-formula preview over what the app shows.

Every local project's accumulated score (the project card and the Overview
headline) under the saved formula and under a draft.

Writes nothing a draft could leave behind. Finding the sources walks the
project's rows under the SAVED formula, exactly as the project list does, so
that walk may fill the same score-cache rows the list would; a run with no
grade database is never opened (it keeps its saved score, see
``SourceDimension``).

Each visible dimension is taken from the run the accumulated view sources it
from (``ProjectRows.latest_rows`` -> ``from_run_id``) and re-scored there:
from the run's findings (``compute_run_grades``) when no dismissal or
deletion touches it, else from its evidence minus the suppressed findings
(``rescore_dimension``), the branch the row fetcher takes. "Before" and
"after" run the same path, so the difference is the formula alone. The row
fetcher itself is used only to find the sources under the saved formula: with
a draft it would read stored grade tables and persist rows keyed by the draft.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.core.scoring.internals import score_to_grade_label
from quodeq.core.scoring.params import ScoringParams
from quodeq.core.scoring.projector_scoring import compute_run_score
from quodeq.core.scoring.report_grades import parse_numeric_score
from quodeq.core.types import DimensionResult
from quodeq.services._accumulated_data import read_run_data
from quodeq.services._fs_project_primitives import local_repo_root
from quodeq.services.deleted import deleted_keys
from quodeq.services.dismissed import dismissed_keys
from quodeq.services.grade_formula import count_rescorable_runs, has_event_log, load_params
from quodeq.services.rescore import filter_excluded_violations, rescore_dimension
from quodeq.services.scoring import ProjectRows
from quodeq.services.suppression_keys import SuppressionKeys
from quodeq.services.wiring import (
    compute_run_grades, has_evaluation_db, load_suppression_rules, load_visible_standard_ids,
)
from quodeq.shared.fault_isolation import run_isolated


@dataclass(frozen=True, slots=True)
class SourceDimension:
    """One visible dimension of a project and the run its accumulated score comes from.

    ``full`` is the run's full dimension (with findings), read only when the
    project has suppressions, since only then can the evidence rescore apply.
    ``saved_score`` is set when an apply cannot rescore the run (no event log
    or no grade database): the dimension then keeps that score under any
    formula, and the run is never opened.
    """
    name: str
    run_dir: Path
    full: DimensionResult | None
    saved_score: float | None = None


@dataclass(frozen=True, slots=True)
class ProjectSources:
    """A project's source dimensions and its suppression keys (None when it has none)."""
    project: str
    dims: tuple[SourceDimension, ...]
    keys: SuppressionKeys | None


def _suppression_keys(project_dir: Path) -> SuppressionKeys | None:
    dismissed, deleted = dismissed_keys(project_dir), deleted_keys(project_dir)
    rules = load_suppression_rules(project_dir)
    return SuppressionKeys(dismissed, deleted, rules) if (dismissed or deleted or rules) else None


def _full_dimension(
    reports_root: Path, project: str, run_id: str, name: str,
    by_run: dict[str, dict[str, DimensionResult]],
) -> DimensionResult | None:
    if run_id not in by_run:
        by_run[run_id] = {(d.dimension or "").lower(): d for d in read_run_data(reports_root, project, run_id)}
    return by_run[run_id].get(name)


def project_sources(reports_root: Path, project: str) -> ProjectSources | None:
    """The visible dimensions the project card averages, each with its source run."""
    rows = ProjectRows.load(reports_root, project)
    if not rows.runs:
        return None
    visible = set(load_visible_standard_ids(local_repo_root(reports_root, project)))
    keys = _suppression_keys(reports_root / project)
    by_run: dict[str, dict[str, DimensionResult]] = {}
    dims = []
    for name, row in rows.latest_rows().items():
        lower = name.lower()
        if lower not in visible or not row.from_run_id:
            continue
        full = _full_dimension(reports_root, project, row.from_run_id, lower, by_run) if keys else None
        run_dir = reports_root / project / row.from_run_id
        frozen = None if _rescorable(run_dir) else parse_numeric_score(row.overall_score)
        dims.append(SourceDimension(lower, run_dir, full, frozen))
    return ProjectSources(project, tuple(dims), keys) if dims else None


def _rescorable(run_dir: Path) -> bool:
    """An apply rewrites this run's grades: it has an event log and a grade database."""
    return has_event_log(run_dir) and has_evaluation_db(run_dir)


def _touched(src: SourceDimension, keys: SuppressionKeys | None) -> bool:
    if keys is None or src.full is None:
        return False
    return len(filter_excluded_violations(src.full, keys)) != len(src.full.violations)


def _dimension_score(
    src: SourceDimension, keys: SuppressionKeys | None, params: ScoringParams,
    tables: dict[Path, list[dict]],
) -> float | None:
    if _touched(src, keys):
        rescored = rescore_dimension(src.full, keys, params=params, run_dir=src.run_dir)
        return parse_numeric_score(rescored.overall_score)
    if src.saved_score is not None:
        return src.saved_score
    if src.run_dir not in tables:
        tables[src.run_dir] = compute_run_grades(src.run_dir, params)[1]
    return next(
        (row["score"] for row in tables[src.run_dir] if (row["dimension"] or "").lower() == src.name),
        None,
    )


def _grade(score: float | None, params: ScoringParams) -> str | None:
    return score_to_grade_label(score, params=params) if score is not None else None


def score_project(sources: ProjectSources, params: ScoringParams) -> dict[str, Any]:
    """The project's overall and per-dimension scores under *params*."""
    tables: dict[Path, list[dict]] = {}
    dims = sorted(
        ({"dimension": s.name, "score": _dimension_score(s, sources.keys, params, tables)} for s in sources.dims),
        key=lambda d: d["dimension"],
    )
    return {
        "overall": compute_run_score(dims, params),
        "dimensions": [{**d, "grade": _grade(d["score"], params)} for d in dims],
    }


def _local_projects(reports_root: Path) -> list[str]:
    if not reports_root.is_dir():
        return []
    return sorted(p.name for p in reports_root.iterdir() if p.is_dir())


def preview_all(
    reports_root: Path, params: ScoringParams, *,
    saved: ScoringParams | None = None,
    sources_for: Callable[[Path, str], ProjectSources | None] = project_sources,
    log: LogSink = NULL_LOG,
) -> dict[str, Any]:
    """Every local project before (saved formula) and after (*params*), plus the apply's run count."""
    saved_params = saved if saved is not None else load_params()
    projects = []
    for project in _local_projects(reports_root):
        # One unreadable project (a locked or corrupt evaluation.db, a broken
        # report) costs only its own entry, as on the project list.
        entry = run_isolated(
            lambda p=project: _project_entry(reports_root, p, saved_params, params, sources_for),
            label=f"grade-formula preview for {project!r}",
            log=log,
            on_error=lambda _exc: None,
        )
        if entry is not None:
            projects.append(entry)
    return {"projects": projects, "runsToRescore": count_rescorable_runs(reports_root)}


def _project_entry(
    reports_root: Path, project: str, saved: ScoringParams, params: ScoringParams,
    sources_for: Callable[[Path, str], ProjectSources | None],
) -> dict[str, Any] | None:
    """One project's before/after, or None when it has nothing the card would score."""
    sources = sources_for(reports_root, project)
    if sources is None:
        return None
    return {"id": project, "before": score_project(sources, saved), "after": score_project(sources, params)}
