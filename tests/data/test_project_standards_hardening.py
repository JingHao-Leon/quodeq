"""Store hardening: owner ids stay inside the projects dir, saves are locked,
migration records only a lasting origin, and odd shapes warn."""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import pytest

from quodeq.data.fs import project_standards
from quodeq.data.fs.standards_prefs import (
    load_project_standards,
    project_settings_file,
    read_project_standards,
    save_enabled_ids,
    save_overrides,
    settings_file_for_owner,
    settings_owner_id,
)


@pytest.fixture
def env(tmp_path):
    return {"QUODEQ_DIR": str(tmp_path / "home")}


def _project(reports: Path, pid: str, **info: str) -> None:
    d = reports / pid
    d.mkdir(parents=True)
    (d / "repository_info.json").write_text(json.dumps({"name": pid, **info}))


def _repo(tmp_path: Path, name: str = "repo") -> Path:
    repo = tmp_path / name
    (repo / ".quodeq").mkdir(parents=True)
    (repo / ".quodeq" / "standards-visibility.json").write_text(
        json.dumps({"version": 1, "visibleStandardIds": ["security"]}))
    return repo


def _files_under(root: Path) -> set[Path]:
    return {p for p in root.rglob("*") if p.is_file()} if root.exists() else set()


@pytest.mark.parametrize("parent", ["/tmp/escape", "..", "../../escape", "a/b", "a\\b", ".", ""])
def test_unsafe_parent_falls_back_to_own_id(tmp_path, parent):
    reports = tmp_path / "ev"
    _project(reports, "child", parent=parent)
    assert settings_owner_id(reports, "child") == "child"


@pytest.mark.parametrize("parent", ["/tmp/escape-abs", "..", "../../escape"])
def test_save_with_unsafe_parent_writes_only_inside_projects_dir(tmp_path, env, parent):
    reports = tmp_path / "ev"
    _project(reports, "child", parent=str(tmp_path / "escape") if parent.startswith("/") else parent)
    save_enabled_ids(reports, "child", ["security"], env=env)
    projects = tmp_path / "home" / "projects"
    outside = _files_under(tmp_path) - _files_under(projects) - _files_under(reports)
    assert outside == set()
    assert (projects / "child" / "standards.json").is_file()


@pytest.mark.parametrize("owner", ["..", "a/b", "/abs", "", "."])
def test_settings_path_refuses_unsafe_owner_id(tmp_path, owner):
    with pytest.raises(ValueError):
        settings_file_for_owner(owner, env={"QUODEQ_DIR": str(tmp_path)})


def _slow_reads(monkeypatch) -> None:
    real = project_standards.read_project_standards

    def slow(path):
        got = real(path)
        time.sleep(0.2)
        return got

    monkeypatch.setattr(project_standards, "read_project_standards", slow)


def test_concurrent_visibility_and_overrides_saves_both_land(tmp_path, env, monkeypatch):
    _slow_reads(monkeypatch)
    threads = [
        threading.Thread(target=save_enabled_ids, args=(None, "p", ["security"]), kwargs={"env": env}),
        threading.Thread(target=save_overrides, args=(None, "p", {"R": {"n": 1}}), kwargs={"env": env}),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    got = load_project_standards(None, "p", env=env)
    assert got.enabled == ("security",)
    assert got.overrides == {"R": {"n": 1}}


def test_migration_racing_a_save_never_overwrites_it(tmp_path, env, monkeypatch):
    repo = _repo(tmp_path)
    reports = tmp_path / "ev"
    _project(reports, "p", path=str(repo))
    real = project_standards.legacy_repo_visibility

    def save_first(root):
        # A PUT lands after the GET saw no file but before it migrates.
        save_enabled_ids(None, "p", ["usability"], env=env)
        return real(root)

    monkeypatch.setattr(project_standards, "legacy_repo_visibility", save_first)
    path = project_settings_file(reports, "p", env=env)
    assert read_project_standards(path).enabled == ("usability",)


def test_explicit_temp_repo_root_records_the_recorded_local_path(tmp_path, env):
    recorded = _repo(tmp_path, "recorded")
    clone = _repo(tmp_path, "clone")
    reports = tmp_path / "ev"
    _project(reports, "p", path=str(recorded))
    got = load_project_standards(reports, "p", repo_root=clone, env=env)
    assert got.enabled == ("security",)
    assert got.migrated_from == str(recorded)


@pytest.mark.parametrize("recorded", ["https://github.com/a/b", "/does/not/exist", None])
def test_explicit_repo_root_without_a_local_recorded_path_records_no_origin(tmp_path, env, recorded):
    clone = _repo(tmp_path, "clone")
    reports = tmp_path / "ev"
    _project(reports, "p", **({"path": recorded} if recorded else {}))
    got = load_project_standards(reports, "p", repo_root=clone, env=env)
    assert got.enabled == ("security",)
    assert got.migrated_from is None
    assert "migratedFrom" not in json.loads(project_settings_file(reports, "p", env=env).read_text())


@pytest.mark.parametrize("payload", ["[1, 2]", '"text"', "3"])
def test_non_object_settings_file_warns_and_reads_defaults(tmp_path, caplog, payload):
    path = tmp_path / "standards.json"
    path.write_text(payload)
    assert read_project_standards(path).is_default
    assert "standards settings" in caplog.text


def test_non_list_enabled_warns_and_reads_defaults(tmp_path, caplog):
    path = tmp_path / "standards.json"
    path.write_text(json.dumps({"version": 2, "enabled": "security", "overrides": {"R": {"n": 1}}}))
    got = read_project_standards(path)
    assert got.is_default and got.overrides == {"R": {"n": 1}}
    assert "standards settings" in caplog.text
