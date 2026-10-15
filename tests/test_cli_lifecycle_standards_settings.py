"""A run resolves (and migrates) its project's settings file before analysis."""
from __future__ import annotations

import json

from quodeq.cli_evaluation import standards_settings_for_run


def test_run_settings_file_is_owner_keyed_and_migrated(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "home"))
    reports = tmp_path / "ev"
    (reports / "parent").mkdir(parents=True)
    (reports / "parent" / "repository_info.json").write_text(json.dumps({"name": "m"}))
    child = reports / "child"
    child.mkdir()
    (child / "repository_info.json").write_text(json.dumps({"name": "m/app", "parent": "parent"}))
    evidence = child / "run-1" / "evidence"
    evidence.mkdir(parents=True)
    repo = tmp_path / "repo"
    (repo / ".quodeq").mkdir(parents=True)
    (repo / ".quodeq" / "standards-overrides.json").write_text(
        json.dumps({"version": 1, "overrides": {"R": {"n": 3}}}))

    path = standards_settings_for_run(reports, evidence, repo)

    assert path == tmp_path / "home" / "projects" / "parent" / "standards.json"
    assert json.loads(path.read_text())["overrides"] == {"R": {"n": 3}}
