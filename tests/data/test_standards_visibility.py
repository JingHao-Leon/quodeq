import json
from pathlib import Path

import pytest

from quodeq.core.standards.visibility import (
    DEFAULT_VISIBLE_STANDARDS,
    VISIBILITY_RELPATH,
    partition_visible,
    validate_visible_ids,
)
from quodeq.data.fs.project_standards import legacy_repo_visibility


def test_defaults_are_the_six_iso_dimensions():
    assert DEFAULT_VISIBLE_STANDARDS == (
        "security", "reliability", "maintainability",
        "performance", "usability", "flexibility",
    )


def _write(root, body):
    path = root / VISIBILITY_RELPATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


def test_legacy_reader_absent_file_or_root_is_none(tmp_path):
    assert legacy_repo_visibility(tmp_path) is None
    assert legacy_repo_visibility(None) is None


def test_legacy_reader_reads_selection_and_empty_list(tmp_path):
    _write(tmp_path, json.dumps({"version": 1, "visibleStandardIds": ["Security", "x"]}))
    assert legacy_repo_visibility(tmp_path) == ("security", "x")
    _write(tmp_path, json.dumps({"version": 1, "visibleStandardIds": []}))
    assert legacy_repo_visibility(tmp_path) == ()


@pytest.mark.parametrize("body", ["not json{", '{"version": 1}', '{"visibleStandardIds": "x"}', "[]"])
def test_legacy_reader_malformed_is_none(tmp_path, body):
    _write(tmp_path, body)
    assert legacy_repo_visibility(tmp_path) is None


def test_legacy_reader_drops_non_string_entries(tmp_path):
    _write(tmp_path, json.dumps({"version": 1, "visibleStandardIds": ["security", 3, None]}))
    assert legacy_repo_visibility(tmp_path) == ("security",)


def test_legacy_reader_deeply_nested_is_none(tmp_path, deeply_nested_json):
    _write(tmp_path, deeply_nested_json)
    assert legacy_repo_visibility(tmp_path) is None


def test_legacy_reader_unnamed_read_failure_propagates(tmp_path, monkeypatch):
    _write(tmp_path, json.dumps({"visibleStandardIds": ["security"]}))

    def _boom(self, *a, **kw):
        raise RuntimeError("unexpected read failure")

    monkeypatch.setattr(Path, "read_text", _boom)
    with pytest.raises(RuntimeError, match="unexpected read failure"):
        legacy_repo_visibility(tmp_path)


def test_validate_accepts_known_ids():
    clean, errors = validate_visible_ids(["security"], {"security", "reliability"})
    assert (clean, errors) == (["security"], [])


def test_validate_rejects_unknown_id():
    clean, errors = validate_visible_ids(["nope"], {"security"})
    assert clean == []
    assert errors == ["nope: unknown standard"]


def test_validate_rejects_non_list():
    clean, errors = validate_visible_ids({"a": 1}, {"security"})
    assert clean == []
    assert errors == ["visibleStandardIds must be an array"]


def test_validate_deduplicates_preserving_order():
    clean, errors = validate_visible_ids(
        ["reliability", "security", "reliability"], {"security", "reliability"})
    assert (clean, errors) == (["reliability", "security"], [])


def test_partition_splits_visible_and_hidden():
    visible, hidden = partition_visible(
        ["Security", "clean-architecture"], ("security",))
    assert visible == ["Security"]
    assert hidden == ["clean-architecture"]


def test_partition_with_none_hides_nothing():
    visible, hidden = partition_visible(["security", "clean-architecture"], None)
    assert visible == ["security", "clean-architecture"]
    assert hidden == []


def test_partition_with_empty_tuple_hides_everything():
    """() is an explicit "hide everything", distinct from None (no filtering).

    Guards against a truthiness check (`if not visible`) in place of `is None`,
    which would silently turn "hide everything" into "hide nothing".
    """
    visible, hidden = partition_visible(["security", "reliability"], ())
    assert visible == []
    assert hidden == ["security", "reliability"]
