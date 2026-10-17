"""Archive minors fixed before cleanup is on by default: a broken archive costs only its own run."""
from __future__ import annotations

from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.data.fs.standards_prefs import ProjectStandards
from quodeq.services import grade_formula
from quodeq.services import grade_formula_inputs as gfi
from quodeq.services import grade_formula_preview as gfp
from tests.services._archive_fixtures import PROJECT, corrupt, make_run
from tests.services._grade_formula_fixtures import formula_path  # noqa: F401 -- pytest fixture


def test_a_corrupt_archive_costs_the_preview_only_its_own_dimension(tmp_path):
    broken = make_run(tmp_path, "run-old", dimension="security")
    healthy = make_run(tmp_path, "run-new", dimension="reliability", days=10)
    corrupt(broken)
    sources = gfp.ProjectSources(PROJECT, (
        gfp.SourceDimension("security", broken, None, stored_score=42.0),
        gfp.SourceDimension("reliability", healthy, None, stored_score=10.0),
    ), None)

    result = gfp.score_project(sources, DEFAULT_PARAMS)

    scores = {d["dimension"]: d["score"] for d in result["dimensions"]}
    assert scores["security"] == 42.0  # the saved score: an apply cannot rescore that run either
    assert scores["reliability"] not in (None, 10.0)  # rescored from its tables


def test_a_corrupt_archive_keeps_its_project_in_the_preview(tmp_path, formula_path, monkeypatch):  # noqa: F811
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "cache.db"))
    monkeypatch.setattr(gfp, "load_project_standards",
                        lambda root, project: ProjectStandards(enabled=("security", "reliability")))
    make_run(tmp_path / "evals", "run-old", dimension="security")
    make_run(tmp_path / "evals", "run-new", dimension="reliability", days=10)
    gfp.preview_all(tmp_path / "evals", DEFAULT_PARAMS)  # the saved score cache rows, as the list would
    corrupt(tmp_path / "evals" / PROJECT / "run-old")

    result = gfp.preview_all(tmp_path / "evals", DEFAULT_PARAMS)

    assert [p["id"] for p in result["projects"]] == [PROJECT]
    dims = {d["dimension"] for d in result["projects"][0]["after"]["dimensions"]}
    assert dims == {"security", "reliability"}


def test_an_unrestorable_run_counts_as_failed_not_rescored(tmp_path, formula_path):  # noqa: F811
    corrupt(make_run(tmp_path, "run-old"))
    make_run(tmp_path, "run-new", days=10)

    result = grade_formula.apply_to_all_runs(tmp_path)

    assert result.failed == ["run-old"]
    assert result.rescored == 1


def test_an_unrestorable_run_is_not_retried(tmp_path, formula_path, monkeypatch):  # noqa: F811
    corrupt(make_run(tmp_path, "run-old"))
    sleeps: list[float] = []
    monkeypatch.setattr(grade_formula.time, "sleep", sleeps.append)

    assert grade_formula.apply_to_all_runs(tmp_path).failed == ["run-old"]
    assert sleeps == []


def test_a_corrupt_archive_keeps_its_project_in_the_editor_inputs(tmp_path, formula_path, monkeypatch):  # noqa: F811
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "cache.db"))
    monkeypatch.setattr(gfp, "load_project_standards",
                        lambda root, project: ProjectStandards(enabled=("security", "reliability")))
    make_run(tmp_path / "evals", "run-old", dimension="security")
    make_run(tmp_path / "evals", "run-new", dimension="reliability", days=10)
    gfi.inputs_all(tmp_path / "evals")
    corrupt(tmp_path / "evals" / PROJECT / "run-old")

    result = gfi.inputs_all(tmp_path / "evals")

    assert [p["id"] for p in result["projects"]] == [PROJECT]
    dims = {d["dimension"]: d for d in result["projects"][0]["dimensions"]}
    assert set(dims) == {"security", "reliability"}
    assert dims["security"]["frozenScore"] is not None and dims["reliability"]["principles"]
