"""Tests for the accumulated grade-formula preview (services/grade_formula_preview.py)."""
from __future__ import annotations

import dataclasses
from pathlib import Path

from quodeq.core.events.models import Judgment
from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.core.types import DimensionResult
from quodeq.data.projection.grade_projector import compute_run_grades, recompute_grades
from quodeq.data.sqlite.state_store import SQLiteStateStore
from quodeq.services import grade_formula_preview as gfp

from tests.services._grade_formula_fixtures import formula_path  # noqa: F401 -- pytest fixture

_STRICT = dataclasses.replace(
    DEFAULT_PARAMS, severity_weight={"critical": 4.0, "major": 3.5, "minor": 0.25},
)


def _make_run(run_dir: Path, dimension: str = "security", majors: int = 6) -> Path:
    """A run dir with findings and grade tables baked under the defaults."""
    run_dir.mkdir(parents=True)
    (run_dir / "events.jsonl").write_text("")
    store = SQLiteStateStore(run_dir)
    for i in range(majors):
        store.record_finding(Judgment(
            practice_id="p1", dimension=dimension, req=f"req{i}", verdict="violation",
            severity="major", file=f"f{i}.py", line=1, title=f"t{i}", reason=f"r{i}",
        ))
    for i in range(8):
        store.record_finding(Judgment(
            practice_id="p1", dimension=dimension, req=f"c{i}", verdict="compliance",
            severity="minor", file=f"g{i}.py", line=1, title=f"ct{i}", reason=f"cr{i}",
        ))
    recompute_grades(run_dir, params=DEFAULT_PARAMS)
    return run_dir


def _tables_score(run_dir: Path, dimension: str, params) -> float:
    _, dims = compute_run_grades(run_dir, params)
    return next(d["score"] for d in dims if d["dimension"].lower() == dimension)


def test_untouched_dimension_is_scored_from_its_run_tables(tmp_path):
    run = _make_run(tmp_path / "proj" / "r1")
    sources = gfp.ProjectSources("proj", (gfp.SourceDimension("security", run, None),), None)

    result = gfp.score_project(sources, _STRICT)

    assert result["dimensions"] == [{
        "dimension": "security", "score": _tables_score(run, "security", _STRICT),
        "grade": result["dimensions"][0]["grade"],
    }]
    assert result["overall"]["score"] == _tables_score(run, "security", _STRICT)
    assert result["overall"]["score"] != _tables_score(run, "security", DEFAULT_PARAMS)


def test_dimensions_from_two_runs_average_into_the_overall(tmp_path):
    sec = _make_run(tmp_path / "proj" / "r_old", "security", majors=6)
    rel = _make_run(tmp_path / "proj" / "r_new", "reliability", majors=1)
    sources = gfp.ProjectSources("proj", (
        gfp.SourceDimension("security", sec, None), gfp.SourceDimension("reliability", rel, None),
    ), None)

    result = gfp.score_project(sources, DEFAULT_PARAMS)

    scores = {d["dimension"]: d["score"] for d in result["dimensions"]}
    assert scores == {"reliability": _tables_score(rel, "reliability", DEFAULT_PARAMS),
                      "security": _tables_score(sec, "security", DEFAULT_PARAMS)}
    assert result["overall"]["score"] == round((scores["security"] + scores["reliability"]) / 2, 1)


def test_touched_dimension_is_rescored_from_evidence_with_the_given_params(tmp_path, monkeypatch):
    run = tmp_path / "proj" / "r1"
    full = DimensionResult(dimension="security", overall_score="9.0/10", violations=[object()])
    calls = []

    def fake_rescore(dim, keys, params, run_dir):
        calls.append((dim, params, run_dir))
        return dataclasses.replace(dim, overall_score="4.2/10")

    monkeypatch.setattr(gfp, "filter_excluded_violations", lambda dim, keys: [])
    monkeypatch.setattr(gfp, "rescore_dimension", fake_rescore)
    keys = object()
    sources = gfp.ProjectSources("proj", (gfp.SourceDimension("security", run, full),), keys)

    result = gfp.score_project(sources, _STRICT)

    assert result["dimensions"][0]["score"] == 4.2
    assert calls == [(full, _STRICT, run)]


def test_preview_all_scores_before_with_saved_and_after_with_the_draft(tmp_path, formula_path):
    run = _make_run(tmp_path / "proj" / "r1")
    sources = gfp.ProjectSources("proj", (gfp.SourceDimension("security", run, None),), None)

    out = gfp.preview_all(tmp_path, _STRICT, sources_for=lambda root, p: sources)

    assert [p["id"] for p in out["projects"]] == ["proj"]
    project = out["projects"][0]
    assert project["before"]["overall"]["score"] == _tables_score(run, "security", DEFAULT_PARAMS)
    assert project["after"]["overall"]["score"] == _tables_score(run, "security", _STRICT)
    assert out["runsToRescore"] == 1


def test_preview_all_leaves_out_projects_without_sources(tmp_path, formula_path):
    (tmp_path / "empty").mkdir()
    (tmp_path / "project_index.json").write_text("{}")

    out = gfp.preview_all(tmp_path, _STRICT, sources_for=lambda root, p: None)

    assert out["projects"] == []


def _files(root: Path) -> dict:
    return {p: (p.stat().st_mtime_ns, p.read_bytes()) for p in root.rglob("*") if p.is_file()}


def test_preview_all_writes_nothing_under_the_reports_root(tmp_path, formula_path):
    run = _make_run(tmp_path / "proj" / "r1")
    sources = gfp.ProjectSources("proj", (gfp.SourceDimension("security", run, None),), None)
    db_before = (run / "evaluation.db").read_bytes()
    # The first open may add SQLite's -wal/-shm sidecars, which hold no data;
    # every later preview must leave every file exactly as it found it.
    gfp.preview_all(tmp_path, _STRICT, sources_for=lambda root, p: sources)
    assert (run / "evaluation.db").read_bytes() == db_before
    warm = _files(tmp_path)

    gfp.preview_all(tmp_path, _STRICT, sources_for=lambda root, p: sources)

    assert _files(tmp_path) == warm


class _FakeRows:
    def __init__(self, runs, latest):
        self.runs = runs
        self._latest = latest

    def latest_rows(self):
        return self._latest


def test_sources_take_each_dimension_from_its_source_run(tmp_path, monkeypatch):
    latest = {
        "Security": DimensionResult(dimension="Security", overall_score="3.5/10", from_run_id="r_new"),
        "Reliability": DimensionResult(dimension="Reliability", overall_score="6.3/10", from_run_id="r_old"),
    }
    monkeypatch.setattr(gfp.ProjectRows, "load", classmethod(lambda cls, root, p: _FakeRows(["run"], latest)))
    monkeypatch.setattr(gfp, "load_visible_standard_ids", lambda repo_root: ["security", "reliability"])

    sources = gfp.project_sources(tmp_path, "proj")

    assert sources.dims == (
        gfp.SourceDimension("security", tmp_path / "proj" / "r_new", None),
        gfp.SourceDimension("reliability", tmp_path / "proj" / "r_old", None),
    )
    assert sources.keys is None


def test_sources_skip_hidden_dimensions(tmp_path, monkeypatch):
    latest = {
        "security": DimensionResult(dimension="security", overall_score="8/10", from_run_id="r1"),
        "usability": DimensionResult(dimension="usability", overall_score="2/10", from_run_id="r1"),
    }
    monkeypatch.setattr(gfp.ProjectRows, "load", classmethod(lambda cls, root, p: _FakeRows(["run"], latest)))
    monkeypatch.setattr(gfp, "load_visible_standard_ids", lambda repo_root: ["security"])

    sources = gfp.project_sources(tmp_path, "proj")

    assert [d.name for d in sources.dims] == ["security"]


def test_sources_none_without_runs(tmp_path, monkeypatch):
    monkeypatch.setattr(gfp.ProjectRows, "load", classmethod(lambda cls, root, p: _FakeRows([], {})))

    assert gfp.project_sources(tmp_path, "proj") is None
