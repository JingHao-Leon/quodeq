"""The report file helpers: both file forms, the plain one first, never a suffix in a dimension name."""
from __future__ import annotations

from pathlib import Path

from quodeq.data.fs.report_parser.report_files import (
    list_report_files, read_report_json, report_dimension, report_file, report_stamp_ns,
)
from tests.data.fs._report_fixtures import write_report


def test_report_dimension_strips_either_suffix_and_rejects_the_rest():
    assert report_dimension(Path("security.json")) == "security"
    assert report_dimension(Path("security.json.gz")) == "security"
    others = ("security_eval.md", ".security.json", "security.json.tmp", "security.json.gz.tmp", "notes.txt")
    assert [report_dimension(Path(n)) for n in others] == [None] * 5


def test_list_report_files_sorts_and_prefers_the_plain_twin(tmp_path):
    write_report(tmp_path, "security", {"a": 1})
    write_report(tmp_path, "quality", {"b": 2}, packed=True)
    write_report(tmp_path, "security", {"old": True}, packed=True)
    listed = [(d, p.name) for d, p in list_report_files(tmp_path)]
    assert listed == [("quality", "quality.json.gz"), ("security", "security.json")]
    assert list_report_files(tmp_path / "missing") == []


def test_report_file_resolves_plain_then_packed_then_none(tmp_path):
    write_report(tmp_path, "quality", {"b": 2}, packed=True)
    assert report_file(tmp_path, "quality").name == "quality.json.gz"
    write_report(tmp_path, "quality", {"b": 3})
    assert report_file(tmp_path, "quality").name == "quality.json"
    assert report_file(tmp_path, "security") is None


def test_read_report_json_reads_both_forms_and_the_stamp_is_the_mtime(tmp_path):
    plain = write_report(tmp_path, "a", {"x": 1}, mtime_ns=1_700_000_000_000_000_000)
    packed = write_report(tmp_path, "b", {"y": 2}, packed=True, mtime_ns=1_700_000_000_000_000_001)
    assert read_report_json(plain) == {"x": 1} and read_report_json(packed) == {"y": 2}
    assert (report_stamp_ns(plain), report_stamp_ns(packed)) == (1_700_000_000_000_000_000, 1_700_000_000_000_000_001)


def test_the_plain_report_wins_over_its_packed_twin(tmp_path):
    write_report(tmp_path, "a", {"v": "plain"})
    write_report(tmp_path, "a", {"v": "packed"}, packed=True)
    assert read_report_json(report_file(tmp_path, "a")) == {"v": "plain"}
