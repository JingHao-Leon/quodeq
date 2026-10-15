"""The machine-local per-project standards settings file."""
from __future__ import annotations

import json

from quodeq.core.standards.visibility import DEFAULT_VISIBLE_STANDARDS
from quodeq.data.fs.standards_prefs import (
    ProjectStandards,
    load_overrides_file,
    read_project_standards,
    settings_file_for_owner,
    write_project_standards,
)


def test_settings_file_lives_under_quodeq_dir(tmp_path):
    path = settings_file_for_owner("abc", env={"QUODEQ_DIR": str(tmp_path)})
    assert path == tmp_path / "projects" / "abc" / "standards.json"


def test_absent_file_reads_as_iso_defaults(tmp_path):
    got = read_project_standards(tmp_path / "missing.json")
    assert got.is_default and got.visible_ids == DEFAULT_VISIBLE_STANDARDS
    assert got.overrides == {}


def test_round_trip_keeps_enabled_overrides_and_origin(tmp_path):
    path = tmp_path / "p" / "standards.json"
    write_project_standards(path, ProjectStandards(
        enabled=("security", "android-kotlin"),
        overrides={"REQ-1": {"maxLines": 400}}, migrated_from="/repo"))
    got = read_project_standards(path)
    assert got.enabled == ("security", "android-kotlin")
    assert got.overrides == {"REQ-1": {"maxLines": 400}}
    assert got.migrated_from == "/repo"
    assert json.loads(path.read_text())["version"] == 2


def test_explicit_empty_list_is_a_real_selection(tmp_path):
    path = tmp_path / "standards.json"
    write_project_standards(path, ProjectStandards(enabled=()))
    got = read_project_standards(path)
    assert got.visible_ids == () and not got.is_default


def test_ids_are_normalized_on_read(tmp_path):
    path = tmp_path / "standards.json"
    path.write_text(json.dumps({"version": 2, "enabled": [" Security", "security", 5]}))
    assert read_project_standards(path).enabled == ("security",)


def test_malformed_file_degrades_to_defaults(tmp_path, caplog):
    path = tmp_path / "standards.json"
    path.write_text("{not json")
    got = read_project_standards(path)
    assert got.is_default and got.overrides == {}
    assert "standards settings" in caplog.text


def test_deeply_nested_json_degrades_instead_of_raising(tmp_path):
    path = tmp_path / "standards.json"
    path.write_text("[" * 100_000 + "]" * 100_000)
    assert read_project_standards(path).is_default


def test_non_dict_override_entries_are_dropped(tmp_path):
    path = tmp_path / "standards.json"
    path.write_text(json.dumps({"overrides": {"A": {"x": 1}, "B": 3}}))
    assert read_project_standards(path).overrides == {"A": {"x": 1}}


def test_write_is_atomic_no_temp_left_behind(tmp_path):
    path = tmp_path / "standards.json"
    write_project_standards(path, ProjectStandards(enabled=("security",)))
    assert [p.name for p in tmp_path.iterdir()] == ["standards.json"]


def test_load_overrides_file_handles_none_and_missing(tmp_path):
    assert load_overrides_file(None) == {}
    assert load_overrides_file(tmp_path / "nope.json") == {}
