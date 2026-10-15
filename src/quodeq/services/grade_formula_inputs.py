"""What the grade-formula editor rescores in the browser, for every project.

Per local project, per visible dimension (the same sources the preview and
the project card use): each scored principle's violation mass per unit of
each severity weight, its compliance mass, observation and worst open
severity, and its score under the saved formula. With these the editor
recomputes every principle, dimension and project for any draft without the
findings. A dimension an apply cannot rescore (no event log or grade
database) is sent as its saved score: it does not move under any formula. A
dimension a suppression touches is read from its evidence, or, when the
evidence is gone, from the run's findings minus the suppressed ones, the way
the rescore's legacy fallback scores it.

Read-only, like the preview: the source walk runs under the saved formula.
"""
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.core.scoring.internals import finding_to_scoring_dict, principle_stages
from quodeq.core.scoring.mass import principle_mass, requirement_rows, unit_masses
from quodeq.core.scoring.params import ScoringParams
from quodeq.services.evidence_rescore import EvidenceScoreRequest, rescore_dimension_from_evidence, standard_dirs
from quodeq.services.grade_formula import load_params
from quodeq.services.grade_formula_preview import (
    ProjectSources, SourceDimension, is_touched, local_projects, project_sources,
)
from quodeq.services.rescore import dismissed_violations, filter_excluded_violations, group_by_principle
from quodeq.services.suppression_keys import SuppressionKeys
from quodeq.services.wiring import load_grade_inputs
from quodeq.shared.fault_isolation import run_isolated


def _principle(pid: str, units: dict, compliance_mass: float, observation: float, worst: str | None,
               score: float) -> dict[str, Any]:
    return {
        "id": pid, "massMinor": units["minor"], "massMajor": units["major"], "massCritical": units["critical"],
        "complianceMass": compliance_mass, "observation": observation, "worst": worst, "score": score,
    }


def _frozen(src: SourceDimension, score: float | None) -> dict[str, Any]:
    return {"dimension": src.name, "frozenScore": score, "principles": []}


def _scored(pid: str, findings: list, compliance: list, dismissed: list, source_file_count: int,
            saved: ScoringParams) -> dict[str, Any]:
    rows = requirement_rows([finding_to_scoring_dict(f) for f in findings],
                            [finding_to_scoring_dict(c) for c in compliance],
                            [finding_to_scoring_dict(d) for d in dismissed])
    mass = principle_mass(rows, source_file_count, params=saved)
    final = principle_stages(mass, params=saved)[3]
    return _principle(pid, unit_masses(mass), mass.compliance_mass, mass.observation, mass.worst, final)


def _from_tables(src: SourceDimension, saved: ScoringParams, cache: dict[Path, Any]) -> dict[str, Any]:
    if src.run_dir not in cache:
        cache[src.run_dir] = load_grade_inputs(src.run_dir)
    inputs = cache[src.run_dir]
    keys = sorted(k for k in set(inputs.violations_by) | set(inputs.compliance_by) if k[0].lower() == src.name)
    principles = [
        _scored(key[1], inputs.violations_by.get(key, []), inputs.compliance_by.get(key, []),
                inputs.dismissed_by.get(key, []), inputs.source_file_count, saved)
        for key in keys
    ]
    return {"dimension": src.name, "frozenScore": None, "principles": principles}


def _from_findings(src: SourceDimension, keys: SuppressionKeys, saved: ScoringParams) -> dict[str, Any]:
    """The run's findings minus the suppressed ones, scored as rescore's legacy fallback scores them."""
    full = src.full
    violations = group_by_principle(filter_excluded_violations(full, keys))
    compliance = group_by_principle(full.compliance)
    dismissed = group_by_principle(dismissed_violations(full, keys))
    principles = [
        _scored(pid, violations.get(pid, []), compliance.get(pid, []), dismissed.get(pid, []),
                full.source_file_count or 0, saved)
        for pid in sorted(set(violations) | set(compliance))
    ]
    return {"dimension": src.name, "frozenScore": None, "principles": principles}


def _from_evidence(src: SourceDimension, sources: ProjectSources, saved: ScoringParams) -> dict[str, Any]:
    full = src.full
    request = EvidenceScoreRequest(
        dismissed=sources.keys.dismissed, deleted=sources.keys.deleted,
        source_file_count=full.source_file_count or 0, files_read=full.files_read or 0,
        params=saved, standard_dirs_fn=standard_dirs,
    )
    result = rescore_dimension_from_evidence(src.run_dir, src.name, request).result
    if result is None:
        return _from_findings(src, sources.keys, saved)
    principles = [
        _principle(pid, dict(ps.unit_masses), ps.compliance_mass, ps.observation, ps.worst, ps.final_score)
        for pid, ps in sorted(result.principles.items())
        if ps.final_score is not None and ps.unit_masses is not None
    ]
    return {"dimension": src.name, "frozenScore": None, "principles": principles}


def _dimension(src: SourceDimension, sources: ProjectSources, saved: ScoringParams, cache: dict) -> dict[str, Any]:
    if is_touched(src, sources.keys):
        return _from_evidence(src, sources, saved)
    if src.saved_score is not None:
        return _frozen(src, src.saved_score)
    return _from_tables(src, saved, cache)


def _project(reports_root: Path, project: str, saved: ScoringParams,
             sources_for: Callable[[Path, str], ProjectSources | None]) -> dict[str, Any] | None:
    sources = sources_for(reports_root, project)
    if sources is None:
        return None
    cache: dict[Path, Any] = {}
    return {"id": project, "dimensions": [_dimension(s, sources, saved, cache) for s in sources.dims]}


def inputs_all(
    reports_root: Path, *, saved: ScoringParams | None = None,
    sources_for: Callable[[Path, str], ProjectSources | None] = project_sources,
    log: LogSink = NULL_LOG,
) -> dict[str, Any]:
    """Every local project's scoring inputs; an unreadable project is skipped and logged."""
    saved_params = saved if saved is not None else load_params()
    projects = []
    for project in local_projects(reports_root):
        entry = run_isolated(
            lambda p=project: _project(reports_root, p, saved_params, sources_for),
            label=f"grade-formula inputs for {project!r}", log=log, on_error=lambda _exc: None,
        )
        if entry is not None:
            projects.append(entry)
    return {"projects": projects}
