"""/api/storage: the off switch, the first-start notice, and no clean beside a grade-formula rescore."""
from __future__ import annotations

import json
import threading

import pytest
from flask import Flask

from quodeq.api.routes_storage import register_storage_routes
from quodeq.services import grade_formula
from quodeq.services.grade_formula_job import GradeFormulaRescorer
from quodeq.services.storage_settings import storage_settings_path
from tests._timeouts import budget
from tests.services._storage_fixtures import FakeProvider, make_run

_LOCALHOST = {"Origin": "http://localhost"}


@pytest.fixture
def root(tmp_path, monkeypatch):
    evals = tmp_path / "evals"
    evals.mkdir()
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "qdir"))
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(evals))
    return evals


def _client(rescorer=None):
    app = Flask(__name__)
    if rescorer is not None:
        app.extensions["grade_formula_rescore"] = rescorer
    register_storage_routes(app, FakeProvider())
    return app.test_client()


def _write_settings(**values):
    path = storage_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(values))


def _wait_done(client) -> bool:
    pause = threading.Event()
    for _ in range(int(budget(10) / 0.01)):
        if client.get("/api/storage/clean").get_json()["clean"]["state"] != "running":
            return True
        pause.wait(0.01)
    return False


def _saved():
    return json.loads(storage_settings_path().read_text())


def test_auto_cleanup_can_be_turned_off_and_keeps_the_window(root):
    client = _client()
    assert client.put("/api/storage/settings", json={"archiveAfterDays": 365}).status_code == 200

    resp = client.put("/api/storage/settings", json={"autoCleanup": False})

    assert resp.get_json() == {"archiveAfterDays": 365, "autoCleanup": False}
    body = client.get("/api/storage").get_json()
    assert (body["autoCleanup"], body["archiveAfterDays"]) == (False, 365)
    assert client.put("/api/storage/settings", json={"autoCleanup": "no"}).status_code == 400


def test_the_notice_says_what_the_next_start_archives(root):
    make_run(root, "p", "old", 300)
    for i in range(5):
        make_run(root, "p", f"newer{i}", 10 + i)
    _write_settings(keep_runs=5, archive_notice="pending")
    client = _client()

    notice = client.get("/api/storage").get_json()["archiveNotice"]

    assert notice["runs"] == 1 and notice["bytes"] > 0
    _write_settings(keep_runs=10, archive_notice="pending")
    assert client.get("/api/storage").get_json()["archiveNotice"] is None  # all six kept: nothing to say


def test_turning_cleanup_off_clears_the_notice(root):
    make_run(root, "p", "old", 300)
    make_run(root, "p", "newer", 10)
    _write_settings(archive_after_days=183, archive_notice="pending")
    client = _client()

    client.put("/api/storage/settings", json={"autoCleanup": False})

    assert client.get("/api/storage").get_json()["archiveNotice"] is None


def test_clean_now_retires_the_notice(root):
    make_run(root, "p", "old", 300)
    make_run(root, "p", "newer", 10)
    _write_settings(archive_after_days=183, archive_notice="pending")

    client = _client()
    assert client.post("/api/storage/clean", headers=_LOCALHOST).status_code == 202

    assert _saved()["archive_notice"] == "done"
    assert _wait_done(client)


class _OwedRescore:
    def owes_pass(self):
        return True


def test_clean_now_is_409_while_a_rescore_runs(root):
    old = make_run(root, "p", "old", 300)
    make_run(root, "p", "newer", 10)

    resp = _client(_OwedRescore()).post("/api/storage/clean", headers=_LOCALHOST)

    assert resp.status_code == 409 and resp.get_json()["code"] == "STORAGE_RESCORE"
    assert not (old / "archive.tar.gz").exists()


def test_clean_now_waits_for_a_resumed_rescore_but_not_a_failed_one(root):
    grade_formula.mark_rescore_pending()  # the last process quit mid-pass
    release = threading.Event()

    def apply(*_a, **_k):
        release.wait(budget(10))
        raise OSError("evaluations folder unreadable")

    rescorer = GradeFormulaRescorer(apply)
    try:
        rescorer.resume_pending(root)
        resp = _client(rescorer).post("/api/storage/clean", headers=_LOCALHOST)
        assert resp.status_code == 409 and resp.get_json()["code"] == "STORAGE_RESCORE"
        release.set()
        assert rescorer.wait_idle(budget(10))
        assert rescorer.snapshot().state == "error" and grade_formula.rescore_pending()
        client = _client(rescorer)
        assert client.post("/api/storage/clean", headers=_LOCALHOST).status_code == 202
        assert _wait_done(client)
    finally:
        release.set()
        grade_formula.clear_rescore_pending()
        rescorer.stop()
