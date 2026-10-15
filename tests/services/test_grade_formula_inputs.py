"""The browser's scoring inputs for every project (services/grade_formula_inputs.py)."""
from __future__ import annotations

import dataclasses
from pathlib import Path

from quodeq.core.events.models import Judgment
from quodeq.core.scoring.internals import principle_stages
from quodeq.core.scoring.mass import PrincipleMass
from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.core.types.scoring import PrincipleScore
from quodeq.data.projection.grade_projector import compute_run_grades, recompute_grades
from quodeq.data.sqlite.state_store import SQLiteStateStore
from quodeq.services import grade_formula_inputs as gfi
from quodeq.services import grade_formula_preview as gfp

from tests.services._grade_formula_fixtures import formula_path  # noqa: F401 -- pytest fixture


def _make_run(run_dir: Path) -> Path:
    run_dir.mkdir(parents=True)
    (run_dir / "events.jsonl").write_text("")
    store = SQLiteStateStore(run_dir)
    for i, sev in enumerate(["major", "major", "minor", "critical"]):
        store.record_finding(Judgment(practice_id="p1", dimension="security", req=f"r{i}", verdict="violation",
                                      severity=sev, file=f"f{i}.py", line=1, title="t", reason=f"r{i}"))
    for i in range(6):
        store.record_finding(Judgment(practice_id="p1", dimension="security", req=f"c{i}", verdict="compliance",
                                      severity="minor", file=f"g{i}.py", line=1, title="t", reason=f"c{i}"))
    recompute_grades(run_dir, params=DEFAULT_PARAMS)
    return run_dir


def _rescore(p: dict, params) -> float:
    w = params.severity_weight
    mass = PrincipleMass(
        violation_mass=p["massMinor"] * w["minor"] + p["massMajor"] * w["major"] + p["massCritical"] * w["critical"],
        compliance_mass=p["complianceMass"], observation=p["observation"], worst=p["worst"],
        violations=(), compliance=(),
    )
    return principle_stages(mass, params=params)[3]


def test_tables_inputs_rescore_to_the_runs_own_principle_scores(tmp_path, formula_path):
    run = _make_run(tmp_path / "proj" / "r1")
    src = gfp.ProjectSources("proj", (gfp.SourceDimension("security", run, None),), None)
    strict = dataclasses.replace(DEFAULT_PARAMS, severity_weight={"minor": 0.5, "major": 3.0, "critical": 6.0})

    out = gfi.inputs_all(tmp_path, sources_for=lambda root, p: src)

    principle = out["projects"][0]["dimensions"][0]["principles"][0]
    rows, _ = compute_run_grades(run, strict)
    assert _rescore(principle, strict) == next(g["score"] for _, g in rows if g["principle_id"] == "p1")
    assert principle["score"] == _rescore(principle, DEFAULT_PARAMS)
    assert principle["worst"] == "critical"


def test_a_frozen_dimension_sends_its_saved_score_only(tmp_path, formula_path):
    legacy = tmp_path / "proj" / "old"
    legacy.mkdir(parents=True)
    src = gfp.ProjectSources("proj", (gfp.SourceDimension("security", legacy, None, saved_score=6.3),), None)

    dim = gfi.inputs_all(tmp_path, sources_for=lambda root, p: src)["projects"][0]["dimensions"][0]

    assert dim == {"dimension": "security", "frozenScore": 6.3, "principles": []}


def test_touched_dimension_takes_its_inputs_from_evidence(tmp_path, formula_path, monkeypatch):
    run = tmp_path / "proj" / "r1"
    run.mkdir(parents=True)
    full = gfp.DimensionResult(dimension="security", overall_score="9.0/10", source_file_count=100, files_read=50)
    principle = PrincipleScore(display_name="Integrity", final_score=7.4, observation=3.0, compliance_mass=2.0,
                               unit_masses={"minor": 0.1, "major": 0.8, "critical": 0.0}, worst="major")
    seen = []

    class _Result:
        principles = {"Integrity": principle}

    def fake_evidence(run_dir, dim_id, request):
        seen.append((run_dir, dim_id, request.dismissed, request.params))
        return type("R", (), {"result": _Result()})()

    monkeypatch.setattr(gfi, "is_touched", lambda src, keys: True)
    monkeypatch.setattr(gfi, "rescore_dimension_from_evidence", fake_evidence)
    keys = gfp.SuppressionKeys(frozenset({("k",)}), frozenset(), ())
    src = gfp.ProjectSources("proj", (gfp.SourceDimension("security", run, full),), keys)

    dim = gfi.inputs_all(tmp_path, sources_for=lambda root, p: src)["projects"][0]["dimensions"][0]

    assert dim["principles"] == [{"id": "Integrity", "massMinor": 0.1, "massMajor": 0.8, "massCritical": 0.0,
                                  "complianceMass": 2.0, "observation": 3.0, "worst": "major", "score": 7.4}]
    assert seen[0][0] == run and seen[0][1] == "security"


def test_touched_dimension_without_evidence_is_frozen_at_its_saved_score(tmp_path, formula_path, monkeypatch):
    run = tmp_path / "proj" / "r1"
    run.mkdir(parents=True)
    full = gfp.DimensionResult(dimension="security", overall_score="5.5/10")
    monkeypatch.setattr(gfi, "is_touched", lambda src, keys: True)
    monkeypatch.setattr(gfi, "rescore_dimension_from_evidence", lambda *a: type("R", (), {"result": None})())
    keys = gfp.SuppressionKeys(frozenset({("k",)}), frozenset(), ())
    src = gfp.ProjectSources("proj", (gfp.SourceDimension("security", run, full),), keys)

    dim = gfi.inputs_all(tmp_path, sources_for=lambda root, p: src)["projects"][0]["dimensions"][0]

    assert dim == {"dimension": "security", "frozenScore": 5.5, "principles": []}


def test_inputs_all_skips_a_project_that_fails(tmp_path, formula_path):
    run = _make_run(tmp_path / "good" / "r1")
    (tmp_path / "bad").mkdir()
    good = gfp.ProjectSources("good", (gfp.SourceDimension("security", run, None),), None)

    def sources_for(root, project):
        if project == "bad":
            raise RuntimeError("locked")
        return good

    assert [p["id"] for p in gfi.inputs_all(tmp_path, sources_for=sources_for)["projects"]] == ["good"]


def test_inputs_write_nothing_under_the_reports_root(tmp_path, formula_path):
    run = _make_run(tmp_path / "proj" / "r1")
    src = gfp.ProjectSources("proj", (gfp.SourceDimension("security", run, None),), None)
    gfi.inputs_all(tmp_path, sources_for=lambda root, p: src)
    files = {p: (p.stat().st_mtime_ns, p.read_bytes()) for p in tmp_path.rglob("*") if p.is_file()}

    gfi.inputs_all(tmp_path, sources_for=lambda root, p: src)

    assert {p: (p.stat().st_mtime_ns, p.read_bytes()) for p in tmp_path.rglob("*") if p.is_file()} == files
