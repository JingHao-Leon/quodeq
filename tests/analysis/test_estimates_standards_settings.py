"""/estimates keys its cache lookups with the project's overrides, read-only.

Overrides fold into every cache key's params_hash, so estimates must read the
same settings file a run reads, or every file in an overridden dimension
counts as a miss. The route resolves that file (read-only, never migrating;
see tests/api/test_estimates_route_standards_settings.py) and passes it in.
"""
from __future__ import annotations

import json
from pathlib import Path

from quodeq.analysis import estimates
from quodeq.analysis.fingerprint import dimension_params_state
from quodeq.cli_evaluation import standards_settings_for_run
from quodeq.data.fs.standards_prefs import ProjectStandards, write_project_standards


def _project(tmp_path: Path) -> tuple[Path, Path]:
    src = tmp_path / "repo"
    src.mkdir()
    (src / "app.py").write_text("def f():\n    return 1\n")
    project_dir = tmp_path / "evaluations" / "proj"
    project_dir.mkdir(parents=True)
    (project_dir / "repository_info.json").write_text(json.dumps({"name": "p", "path": str(src)}))
    return src, project_dir


def _captured_config(monkeypatch, project_dir: Path, settings: Path | None):
    seen = []

    def capture(config, dimensions, count_only=False):
        seen.append(config)
        return {}

    monkeypatch.setattr(estimates, "compute_dim_estimates", capture)
    estimates.project_estimates_payload(
        project_dir, ["maintainability"], clean_scan=False, standards_settings=settings)
    assert len(seen) == 1
    return seen[0]


def test_estimates_key_with_the_runs_overrides(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "home"))
    src, project_dir = _project(tmp_path)
    run_file = standards_settings_for_run(
        project_dir / "run-1" / "evidence", src, reports_root=project_dir.parent)
    write_project_standards(run_file, ProjectStandards(overrides={"M-MOD-1": {"max_complexity": 30}}))

    config = _captured_config(monkeypatch, project_dir, run_file)

    assert config.standards_settings == run_file
    est_hash, _ = dimension_params_state(config.standards_dir, "maintainability", config.standards_settings)
    run_hash, _ = dimension_params_state(config.standards_dir, "maintainability", run_file)
    assert est_hash == run_hash != ""


def test_estimates_never_write_the_settings_file(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "home"))
    _src, project_dir = _project(tmp_path)
    settings = tmp_path / "home" / "projects" / "proj" / "standards.json"

    config = _captured_config(monkeypatch, project_dir, settings)

    assert config.standards_settings == settings
    assert not settings.exists()
