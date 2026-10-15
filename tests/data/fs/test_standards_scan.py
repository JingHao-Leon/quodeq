"""File mechanics behind the standards fingerprint."""
from __future__ import annotations

import json

from quodeq.data.fs.standards_scan import file_stamp, scoring_content_hash, standard_files

_IGNORE = frozenset({"name", "description"})


def test_ignored_keys_do_not_change_the_hash(tmp_path):
    path = tmp_path / "s.json"
    path.write_text(json.dumps({"name": "A", "principles": [1]}), encoding="utf-8")
    before = scoring_content_hash(path, _IGNORE)
    path.write_text(json.dumps({"name": "B", "description": "new", "principles": [1]}), encoding="utf-8")
    assert scoring_content_hash(path, _IGNORE) == before


def test_other_keys_change_the_hash(tmp_path):
    path = tmp_path / "s.json"
    path.write_text(json.dumps({"principles": [1]}), encoding="utf-8")
    before = scoring_content_hash(path, _IGNORE)
    path.write_text(json.dumps({"principles": [1, 2]}), encoding="utf-8")
    assert scoring_content_hash(path, _IGNORE) != before


def test_unparseable_file_hashes_by_bytes_and_missing_is_none(tmp_path):
    path = tmp_path / "s.json"
    path.write_text("{not json", encoding="utf-8")
    assert scoring_content_hash(path, _IGNORE)
    assert scoring_content_hash(tmp_path / "missing.json", _IGNORE) is None
    assert file_stamp(tmp_path / "missing.json") is None


def test_standard_files_lists_json_of_existing_dirs_only(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir()
    (a / "z.json").write_text("{}", encoding="utf-8")
    (a / "y.json").write_text("{}", encoding="utf-8")
    (a / "notes.txt").write_text("", encoding="utf-8")
    assert [p.name for p in standard_files((a, b, None))] == ["y.json", "z.json"]
