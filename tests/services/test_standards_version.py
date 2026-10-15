"""The standards fingerprint and its place in the score-cache version hashes."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.data.fs.standards_prefs import save_enabled_ids, save_overrides
from quodeq.services.score_cache import (
    VersionInputs,
    run_scoped_version,
    score_cache_version,
    suppression_state_fingerprint,
)
from quodeq.services.standards_version import scored_dimensions, standards_fingerprint


def _bump_mtime(path: Path) -> None:
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 2_000_000_000))


def _project(tmp_path: Path, repo: Path | None = None) -> Path:
    reports_root = tmp_path / "reports"
    project_dir = reports_root / "proj"
    project_dir.mkdir(parents=True)
    if repo is not None:
        repo.mkdir(parents=True, exist_ok=True)
        (project_dir / "repository_info.json").write_text(
            json.dumps({"path": str(repo)}), encoding="utf-8")
    return project_dir


def _edit(path: Path) -> None:
    """Change what a rescore reads (a principle), not just the file's mtime."""
    path.write_text('{"principles": [{"id": "edited"}]}', encoding="utf-8")
    _bump_mtime(path)


def _scored(project_dir: Path, *dims: str, run: str = "run-1") -> None:
    """A finished run that scored *dims* (evaluation files only, as on disk)."""
    evaluation = project_dir / run / "evaluation"
    evaluation.mkdir(parents=True, exist_ok=True)
    for dim in dims:
        (evaluation / f"{dim}.json").write_text("{}", encoding="utf-8")


@pytest.fixture(autouse=True)
def _hermetic_evaluators(tmp_path, monkeypatch):
    """Never stat the real ~/.quodeq/evaluators; tests that need one patch again."""
    monkeypatch.setattr(
        "quodeq.services.standards_version.standard_dirs", lambda: (None, tmp_path / "no-evaluators"))


@pytest.fixture()
def project_dir(tmp_path):
    return _project(tmp_path)


def _compiled(tmp_path: Path) -> Path:
    compiled = tmp_path / "standards" / "compiled"
    compiled.mkdir(parents=True)
    (compiled / "security.json").write_text("{}", encoding="utf-8")
    (compiled / "quality.json").write_text("{}", encoding="utf-8")
    return compiled


class TestStandardsFingerprint:
    def test_stable_across_calls(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        a = standards_fingerprint(project_dir, compiled_dir=compiled)
        b = standards_fingerprint(project_dir, compiled_dir=compiled)
        assert a == b

    def test_edited_compiled_standard_changes_it(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        _scored(project_dir, "security")
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        (compiled / "security.json").write_text('{"principles": []}', encoding="utf-8")
        _bump_mtime(compiled / "security.json")
        assert standards_fingerprint(project_dir, compiled_dir=compiled) != before

    def test_added_compiled_standard_changes_it(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        _scored(project_dir, "custom")
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        (compiled / "custom.json").write_text("{}", encoding="utf-8")
        assert standards_fingerprint(project_dir, compiled_dir=compiled) != before

    def test_project_overrides_change_it(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        save_overrides(project_dir.parent, project_dir.name, {"R1": {"max": 3}})
        assert standards_fingerprint(project_dir, compiled_dir=compiled) != before

    def test_toggle_keeps_fingerprint_override_edit_changes_it(self, tmp_path, project_dir):
        """A visibility toggle must never rebuild the score cache (Victor, 2026-10-15)."""
        reports, pid = project_dir.parent, project_dir.name
        save_overrides(reports, pid, {"R": {"n": 1}})
        a = standards_fingerprint(project_dir, compiled_dir=None)
        save_enabled_ids(reports, pid, ["security"])
        b = standards_fingerprint(project_dir, compiled_dir=None)
        save_overrides(reports, pid, {"R": {"n": 2}})
        c = standards_fingerprint(project_dir, compiled_dir=None)
        assert a == b
        assert a != c

    def test_added_custom_evaluator_changes_it(self, tmp_path, monkeypatch):
        compiled = _compiled(tmp_path)
        evaluators = tmp_path / "evaluators"
        evaluators.mkdir()
        monkeypatch.setattr(
            "quodeq.services.standards_version.standard_dirs", lambda: (compiled, evaluators))
        project_dir = _project(tmp_path)
        _scored(project_dir, "custom")
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        (evaluators / "custom.json").write_text("{}", encoding="utf-8")
        assert standards_fingerprint(project_dir, compiled_dir=compiled) != before

    def test_other_projects_overrides_do_not_change_it(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        save_overrides(project_dir.parent, "other", {"R1": {"max": 3}})
        assert standards_fingerprint(project_dir, compiled_dir=compiled) == before

    def test_missing_compiled_dir_is_tolerated(self, tmp_path):
        project_dir = _project(tmp_path)
        fp = standards_fingerprint(project_dir, compiled_dir=tmp_path / "nowhere")
        assert isinstance(fp, str) and fp

    def test_no_local_repo_is_tolerated(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        (project_dir / "repository_info.json").write_text(
            json.dumps({"path": "https://example.invalid/x.git"}), encoding="utf-8")
        assert standards_fingerprint(project_dir, compiled_dir=compiled)


class TestScoredOnly:
    """Only standards a run of the project analysed feed its fingerprint (Victor, 2026-10-15)."""

    def _evaluators(self, tmp_path, monkeypatch, compiled):
        evaluators = tmp_path / "evaluators"
        evaluators.mkdir()
        monkeypatch.setattr(
            "quodeq.services.standards_version.standard_dirs", lambda: (compiled, evaluators))
        return evaluators

    def test_adding_an_unscored_custom_standard_keeps_it(self, tmp_path, monkeypatch):
        compiled = _compiled(tmp_path)
        evaluators = self._evaluators(tmp_path, monkeypatch, compiled)
        project_dir = _project(tmp_path)
        _scored(project_dir, "security")
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        (evaluators / "android-kotlin.json").write_text("{}", encoding="utf-8")
        assert standards_fingerprint(project_dir, compiled_dir=compiled) == before

    def test_editing_a_scored_custom_standard_changes_it(self, tmp_path, monkeypatch):
        compiled = _compiled(tmp_path)
        evaluators = self._evaluators(tmp_path, monkeypatch, compiled)
        (evaluators / "android-kotlin.json").write_text("{}", encoding="utf-8")
        project_dir = _project(tmp_path)
        _scored(project_dir, "android-kotlin")
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        _edit(evaluators / "android-kotlin.json")
        assert standards_fingerprint(project_dir, compiled_dir=compiled) != before

    def test_editing_an_unscored_compiled_standard_keeps_it(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        _scored(project_dir, "security")
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        _bump_mtime(compiled / "quality.json")
        assert standards_fingerprint(project_dir, compiled_dir=compiled) == before

    def test_deleting_a_scored_standard_changes_it(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        _scored(project_dir, "security")
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        (compiled / "security.json").unlink()
        assert standards_fingerprint(project_dir, compiled_dir=compiled) != before

    def test_in_progress_run_counts_its_evidence_dimensions(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        evidence = project_dir / "run-live" / "evidence"
        evidence.mkdir(parents=True)
        (evidence / "quality_evidence.jsonl").write_text("", encoding="utf-8")
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        _edit(compiled / "quality.json")
        assert standards_fingerprint(project_dir, compiled_dir=compiled) != before

    def test_project_without_runs_is_stable(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        _bump_mtime(compiled / "security.json")
        assert standards_fingerprint(project_dir, compiled_dir=compiled) == before

    def test_dimension_ids_match_case_insensitively(self, tmp_path):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        _scored(project_dir, "Security")
        before = standards_fingerprint(project_dir, compiled_dir=compiled)
        _edit(compiled / "security.json")
        assert standards_fingerprint(project_dir, compiled_dir=compiled) != before

    def test_non_run_entries_are_ignored(self, tmp_path):
        project_dir = _project(tmp_path, repo=tmp_path / "repo")
        (project_dir / "evaluation.db").write_text("", encoding="utf-8")
        (project_dir / ".cache").mkdir()
        _scored(project_dir, "security")
        assert scored_dimensions(project_dir) == frozenset({"security"})


class TestVersionHashesFoldStandards:
    def test_run_scoped_version_changes_with_standards(self):
        a = run_scoped_version(DEFAULT_PARAMS, set(), set(), set(), set(), standards="s1")
        b = run_scoped_version(DEFAULT_PARAMS, set(), set(), set(), set(), standards="s2")
        assert a != b

    def test_memo_fingerprint_changes_with_standards(self):
        a = suppression_state_fingerprint(DEFAULT_PARAMS, set(), set(), standards="s1")
        b = suppression_state_fingerprint(DEFAULT_PARAMS, set(), set(), standards="s2")
        assert a != b

    def test_version_inputs_read_the_project_standards(self, tmp_path, monkeypatch):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        _scored(project_dir, "security")
        monkeypatch.setattr(
            "quodeq.services.standards_version.standard_dirs", lambda: (compiled, None))
        before = VersionInputs.of(DEFAULT_PARAMS, set(), set(), project_dir)
        _edit(compiled / "security.json")
        after = VersionInputs.of(DEFAULT_PARAMS, set(), set(), project_dir)
        assert before.standards != after.standards
        assert before.run_state("run-1") != after.run_state("run-1")

    def test_score_cache_version_changes_with_standards(self, tmp_path, monkeypatch):
        compiled = _compiled(tmp_path)
        project_dir = _project(tmp_path)
        _scored(project_dir, "security")
        monkeypatch.setattr(
            "quodeq.services.standards_version.standard_dirs", lambda: (compiled, None))
        before = score_cache_version(project_dir, DEFAULT_PARAMS)
        _edit(compiled / "security.json")
        assert score_cache_version(project_dir, DEFAULT_PARAMS) != before
