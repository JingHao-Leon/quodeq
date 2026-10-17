"""The score cache in a directory this process may not write to: hits serve, writes are skipped."""
import os
import sys

import pytest

from quodeq.data.sqlite.read_only import is_read_only
from quodeq.data.sqlite.score_cache_db import open_score_cache
from quodeq.services.score_cache import cached_project_summary

pytestmark = pytest.mark.skipif(
    sys.platform == "win32" or (hasattr(os, "geteuid") and os.geteuid() == 0),
    reason="needs POSIX permissions that bind the current user")


def test_cache_opens_read_only_and_read_through_still_computes(tmp_path, monkeypatch):
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(cache_dir / "sc.db"))
    calls = []
    assert cached_project_summary("p", "v1", lambda: (calls.append(1) or {"grade": "A"})) == {"grade": "A"}
    assert cached_project_summary("p", "v1", lambda: (calls.append(2) or {"grade": "B"})) == {"grade": "A"}
    assert calls == [1]
    cache_dir.chmod(0o555)
    try:
        with open_score_cache() as conn:
            assert is_read_only(conn)
        # A hit is served from the read-only cache; a miss computes and does not raise.
        assert cached_project_summary("p", "v1", lambda: {"grade": "C"}) == {"grade": "A"}
        assert cached_project_summary("p", "v2", lambda: {"grade": "D"}) == {"grade": "D"}
    finally:
        cache_dir.chmod(0o755)
