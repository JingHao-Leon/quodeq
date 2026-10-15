"""A run resolves (and migrates) its project's settings file before analysis."""
from __future__ import annotations

import argparse
import json

from quodeq.cli_evaluation import ResolvedInputs, build_run_config, standards_settings_for_run


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

    path = standards_settings_for_run(evidence, repo, reports_root=reports)

    assert path == tmp_path / "home" / "projects" / "parent" / "standards.json"
    assert json.loads(path.read_text())["overrides"] == {"R": {"n": 3}}


def test_build_run_config_uses_the_reports_root_setup_run_dirs_returned(tmp_path, monkeypatch):
    """The real reports root threads through, so a scoped child run reads its
    parent's settings file (owner lookup needs the reports root)."""
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "home"))
    reports = tmp_path / "ev"
    (reports / "parent").mkdir(parents=True)
    (reports / "child").mkdir()
    (reports / "child" / "repository_info.json").write_text(json.dumps({"name": "c", "parent": "parent"}))
    evidence = reports / "child" / "run-1" / "evidence"
    evidence.mkdir(parents=True)
    args = argparse.Namespace(
        dimensions=None, no_verify=False, max_turns=None, max_duration=None, n_subagents=5,
        pool_budget=None, clean_scan=False, legacy_incremental=False,
    )
    inputs = ResolvedInputs(src=tmp_path, language="python", manifest=None, dims_data={})

    config = build_run_config(args, inputs=inputs, evidence_dir=evidence, env={}, reports_root=reports)

    assert config.standards_settings == tmp_path / "home" / "projects" / "parent" / "standards.json"
