"""The report file helpers: both file forms, the plain one first, never a suffix in a dimension name."""
from __future__ import annotations

from pathlib import Path

import pytest

from quodeq.data.fs.report_files import (
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
    # Stamps a microsecond apart: NTFS keeps 100 ns ticks, so a 1 ns difference would not survive on Windows.
    plain = write_report(tmp_path, "a", {"x": 1}, mtime_ns=1_700_000_000_000_000_000)
    packed = write_report(tmp_path, "b", {"y": 2}, packed=True, mtime_ns=1_700_000_000_000_001_000)
    assert read_report_json(plain) == {"x": 1} and read_report_json(packed) == {"y": 2}
    assert (report_stamp_ns(plain), report_stamp_ns(packed)) == (1_700_000_000_000_000_000, 1_700_000_000_000_001_000)


def test_the_plain_report_wins_over_its_packed_twin(tmp_path):
    write_report(tmp_path, "a", {"v": "plain"})
    write_report(tmp_path, "a", {"v": "packed"}, packed=True)
    assert read_report_json(report_file(tmp_path, "a")) == {"v": "plain"}


def test_a_corrupt_packed_body_reads_as_an_os_error(tmp_path):
    # A damaged deflate stream raises zlib.error inside gzip; readers must see an OSError like for a bad header.
    packed = write_report(tmp_path, "a", {"x": "0123456789abcdef" * 400}, packed=True)
    body = bytearray(packed.read_bytes())
    body[10:18] = b"\x00\xff" * 4
    packed.write_bytes(bytes(body))
    with pytest.raises(OSError):
        read_report_json(packed)
    assert list_report_files(tmp_path) == [("a", packed)]  # still listed; the readers that skip, skip it
