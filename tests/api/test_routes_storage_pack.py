"""The storage API tells pack work apart from archive work: the preview, the notice and the clean snapshot."""
from __future__ import annotations

import gzip
import json

import pytest
from flask import Flask

from quodeq.api.routes_storage import register_storage_routes
from quodeq.core.observability import NULL_LOG
from quodeq.services.storage_cleanup import archive_keeping_keys
from quodeq.services.storage_settings import storage_settings_path
from tests.services._archive_fixtures import make_run
from tests.services._storage_fixtures import FakeProvider


@pytest.fixture
def root(tmp_path, monkeypatch):
    evals = tmp_path / "evals"
    evals.mkdir()
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "qdir"))
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "qdir" / "score_cache.db"))
    return evals


def _client():
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_storage_routes(app, FakeProvider())
    return app.test_client()


def _archived_with_plain_reports(root):
    """The shape 1.15.0 left: archived, no database, plain reports."""
    old = make_run(root, "run-old", days=400)
    make_run(root, "run-new", days=10)
    archive_keeping_keys(old, NULL_LOG)
    packed = old / "evaluation" / "security.json.gz"
    (old / "evaluation" / "security.json").write_bytes(gzip.decompress(packed.read_bytes()))
    packed.unlink()
    return old


def test_the_preview_and_the_notice_report_pack_work_on_its_own(root):
    _archived_with_plain_reports(root)
    path = storage_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"keep_runs": 5, "keep_notice": "pending"}))
    client = _client()
    preview = client.get("/api/storage/preview").get_json()
    notice = client.get("/api/storage").get_json()["archiveNotice"]
    assert (preview["archive"], preview["pack"]) == (0, 1) and preview["frees"] > 0
    assert (notice["runs"], notice["pack"]) == (0, 1) and notice["bytes"] == preview["frees"]


def test_the_clean_snapshot_carries_the_packed_count(root):
    client = _client()
    assert client.get("/api/storage/clean").get_json()["clean"]["packed"] == 0
