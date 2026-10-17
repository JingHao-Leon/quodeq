"""The modification date a legacy custom standard falls back to."""
import os
from datetime import datetime

from quodeq.data.fs.standards_store import standard_modified_date


def test_modified_date_is_the_files_local_mtime_date(tmp_path):
    path = tmp_path / "s.json"
    path.write_text("{}", encoding="utf-8")
    ts = datetime(2026, 10, 14, 12, 0).timestamp()
    os.utime(path, (ts, ts))
    assert standard_modified_date(path) == "2026-10-14"


def test_missing_file_has_no_date(tmp_path):
    assert standard_modified_date(tmp_path / "missing.json") is None
