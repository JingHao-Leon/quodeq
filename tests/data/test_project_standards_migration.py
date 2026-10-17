"""Owner resolution (scoped children share the parent) and repo-file migration."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from quodeq.data.fs.standards_prefs import (
    load_project_standards,
    project_settings_file,
    save_enabled_ids,
    save_overrides,
    settings_owner_id,
)


@pytest.fixture
def env(tmp_path):
    return {"QUODEQ_DIR": str(tmp_path / "home")}


def _project(reports: Path, pid: str, *, path: str | None = None, parent: str | None = None) -> None:
    d = reports / pid
    d.mkdir(parents=True)
    info: dict = {"name": pid}
    if path:
        info["path"] = path
    if parent:
        info["parent"] = parent
    (d / "repository_info.json").write_text(json.dumps(info))


def _repo(tmp_path: Path, *, visible=None, overrides=None) -> Path:
    repo = tmp_path / "repo"
    (repo / ".quodeq").mkdir(parents=True)
    if visible is not None:
        (repo / ".quodeq" / "standards-visibility.json").write_text(
            json.dumps({"version": 1, "visibleStandardIds": visible}))
    if overrides is not None:
        (repo / ".quodeq" / "standards-overrides.json").write_text(
            json.dumps({"version": 1, "overrides": overrides}))
    return repo


def test_scoped_child_resolves_to_parent(tmp_path):
    reports = tmp_path / "ev"
    _project(reports, "parent")
    _project(reports, "child", parent="parent")
    assert settings_owner_id(reports, "child") == "parent"
    assert settings_owner_id(reports, "parent") == "parent"


def test_unknown_id_is_its_own_owner(tmp_path):
    assert settings_owner_id(tmp_path / "ev", "shared-uuid") == "shared-uuid"
    assert settings_owner_id(None, "x") == "x"


def test_child_toggle_is_seen_by_parent_and_siblings(tmp_path, env):
    reports = tmp_path / "ev"
    _project(reports, "parent")
    _project(reports, "app", parent="parent")
    _project(reports, "backend", parent="parent")
    save_enabled_ids(reports, "app", ["security", "android-kotlin"], env=env)
    for pid in ("parent", "backend"):
        assert load_project_standards(reports, pid, env=env).enabled == ("security", "android-kotlin")


def test_migrates_both_repo_files_once_and_leaves_repo_untouched(tmp_path, env):
    repo = _repo(tmp_path, visible=["security"], overrides={"R": {"n": 1}})
    before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in (repo / ".quodeq").iterdir()}
    reports = tmp_path / "ev"
    _project(reports, "p", path=str(repo))
    got = load_project_standards(reports, "p", env=env)
    assert got.enabled == ("security",) and got.overrides == {"R": {"n": 1}}
    assert got.migrated_from == str(repo)
    assert {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in (repo / ".quodeq").iterdir()} == before


def test_later_repo_edits_are_ignored_after_migration(tmp_path, env):
    repo = _repo(tmp_path, visible=["security"])
    reports = tmp_path / "ev"
    _project(reports, "p", path=str(repo))
    load_project_standards(reports, "p", env=env)
    (repo / ".quodeq" / "standards-visibility.json").write_text(
        json.dumps({"version": 1, "visibleStandardIds": ["usability"]}))
    assert load_project_standards(reports, "p", env=env).enabled == ("security",)


def test_explicit_repo_root_wins_over_recorded_path(tmp_path, env):
    repo = _repo(tmp_path, visible=["reliability"])
    assert load_project_standards(None, "p", repo_root=repo, env=env).enabled == ("reliability",)


@pytest.mark.parametrize("recorded", ["https://github.com/a/b", "/does/not/exist"])
def test_online_or_missing_repo_reads_defaults_without_writing(tmp_path, env, recorded):
    reports = tmp_path / "ev"
    _project(reports, "p", path=recorded)
    got = load_project_standards(reports, "p", env=env)
    assert got.is_default
    assert not project_settings_file(reports, "p", env=env).exists()


def test_no_repo_files_means_no_machine_file(tmp_path, env):
    repo = _repo(tmp_path)
    reports = tmp_path / "ev"
    _project(reports, "p", path=str(repo))
    assert load_project_standards(reports, "p", env=env).is_default
    assert not project_settings_file(reports, "p", env=env).exists()


def test_save_overrides_keeps_enabled(tmp_path, env):
    save_enabled_ids(None, "p", ["security"], env=env)
    save_overrides(None, "p", {"R": {"n": 2}}, env=env)
    got = load_project_standards(None, "p", env=env)
    assert got.enabled == ("security",) and got.overrides == {"R": {"n": 2}}


def test_no_project_id_reads_defaults(env):
    assert load_project_standards(None, None, env=env).is_default


def test_read_only_resolution_never_migrates(tmp_path, env):
    repo = _repo(tmp_path, visible=["security"], overrides={"R": {"n": 1}})
    reports = tmp_path / "ev"
    _project(reports, "p", path=str(repo))
    path = project_settings_file(reports, "p", repo_root=repo, env=env, migrate=False)
    assert path == tmp_path / "home" / "projects" / "p" / "standards.json"
    assert not path.exists()
