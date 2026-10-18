"""Archived runs in the shared clone: routine reads keep them packed, opening one unpacks it safely.

The archived run is published the way a second machine would see it: a
scratch clone archives ``run-1`` (its database, with a sentinel table, packed
inside), commits and pushes; the configured clone then refreshes from the
origin. ``run-2`` stays in full form and is the newest run, so routes that
default to the latest run never open ``run-1``.
"""
from __future__ import annotations

import re
import shutil
import sqlite3
import subprocess
import threading
from pathlib import Path

import pytest

from quodeq.data.fs import run_archive
from quodeq.data.fs.run_archive_reports import unpack_reports_in_place
from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, RESTORED_STAMP, archive_run, is_archived
from quodeq.data.fs.shared_clone_runs import local_db_marker, unpacked_marker
from quodeq.data.fs.shared_repo import refresh_shared_clone, shared_evaluations_root, shared_repo_path
from quodeq.data.sqlite.findings_repository import SqliteFindingsRepository
from tests.api._routes_shared_read_fixtures import app, client, wait_shared_warmup_idle  # noqa: F401 -- fixtures
from tests._timeouts import budget

_SKIP = ("stream", "/events", "/export")
_ARCHIVED, _FULL = "run-1", "run-2"
_DB_FILES = ("evaluation.db", "evaluation.db-wal", "evaluation.db-shm")


def _git(*args: str, cwd: Path) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True, timeout=budget(30),
    ).stdout


def _plant_sentinel(db: Path) -> None:
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE sentinel_marker (v TEXT)")
    conn.execute("INSERT INTO sentinel_marker VALUES ('from the repository')")
    conn.commit()
    conn.close()


def _has_sentinel(db: Path) -> bool:
    conn = sqlite3.connect(db)
    try:
        return conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'sentinel_marker'").fetchone() is not None
    finally:
        conn.close()


def _publish_from_scratch(url: str, tmp_path: Path, *, force_db: bool = False) -> None:
    """Archive run-1 (sentinel db inside) in a scratch clone, add run-2, push; refresh the configured clone."""
    work = tmp_path / "machine-a"
    _git("clone", "-q", url, str(work), cwd=tmp_path)
    project = work / "evaluations" / "proj-a"
    old = project / _ARCHIVED
    eval_json = shared_evaluations_root(url) / "proj-a" / _ARCHIVED / "evaluation" / "Security.json"
    (old / "evaluation").mkdir(exist_ok=True)
    shutil.copy(eval_json, old / "evaluation" / "Security.json")
    new = project / _FULL
    shutil.copytree(old, new)
    (new / "status.json").write_text('{"state": "done", "schema_version": 2}', encoding="utf-8")
    SqliteFindingsRepository(old).ensure_projected()
    _plant_sentinel(old / "evaluation.db")
    archive_run(old)
    unpack_reports_in_place(old)  # a shared repository carries plain reports, as publish writes them
    for leftover in (".archive.lock", RESTORED_STAMP):
        (old / leftover).unlink(missing_ok=True)
    if force_db:
        _plant_sentinel(new / "evaluation.db")
        _git("add", "-f", "--", f"evaluations/proj-a/{_FULL}/evaluation.db", cwd=work)
    _git("add", "-A", "--", f"evaluations/proj-a/{_ARCHIVED}", f"evaluations/proj-a/{_FULL}", cwd=work)
    _git("commit", "-qm", "archive run-1", cwd=work)
    _git("push", "-q", "origin", "HEAD", cwd=work)
    ok, reason = refresh_shared_clone(url)
    assert ok, reason


@pytest.fixture
def archived_clone(shared_clone_fixture, tmp_path):
    url = shared_clone_fixture
    _publish_from_scratch(url, tmp_path)
    run = shared_evaluations_root(url) / "proj-a" / _ARCHIVED
    assert is_archived(run) and not (run / "events.jsonl").exists()
    return url, run


def _shared_get_urls(flask_app) -> list[str]:
    urls = []
    for rule in sorted(flask_app.url_map.iter_rules(), key=lambda r: r.rule):
        path = rule.rule
        if "GET" not in rule.methods or not path.startswith("/api/shared/"):
            continue
        if "<run" in path or any(s in path for s in _SKIP):
            continue
        url = re.sub(r"<project>", "proj-a", path)
        urls.append(re.sub(r"<[^>]+>", "Security", url))
    return urls


def _unpacked(run: Path) -> bool:
    return (run / "events.jsonl").exists() or unpacked_marker(run).exists()


def _repack(run: Path) -> None:
    for name in ("events.jsonl", *_DB_FILES):
        (run / name).unlink(missing_ok=True)
    unpacked_marker(run).unlink(missing_ok=True)
    local_db_marker(run).unlink(missing_ok=True)
    for log in (run / "evidence").glob("*_evidence.jsonl"):
        log.unlink()


def _open(client, run_id: str = _ARCHIVED):  # noqa: F811
    resp = client.get(f"/api/shared/projects/proj-a/violations?run={run_id}")
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return resp.get_json()


def test_routine_shared_reads_leave_the_archived_run_packed(client, archived_clone):  # noqa: F811
    _url, run = archived_clone
    urls = _shared_get_urls(client.application)
    assert "/api/shared/projects/proj-a/runs" in urls and "/api/shared/projects" in urls
    unpacked = []
    for url in [*urls, "/api/shared/projects/proj-a/dashboard?view=overview", "/api/shared/projects?refresh=1"]:
        client.get(url)
        wait_shared_warmup_idle()
        if _unpacked(run) or not is_archived(run):
            unpacked.append(url)
            _repack(run)
    assert unpacked == []


def test_opening_the_archived_run_unpacks_in_place_and_rebuilds_the_database(client, archived_clone):  # noqa: F811
    _url, run = archived_clone
    body = _open(client)
    assert body["total"] >= 1
    assert (run / "events.jsonl").is_file() and (run / ARCHIVE_FILENAME).is_file()
    assert unpacked_marker(run).is_file() and not (run / RESTORED_STAMP).exists()
    assert local_db_marker(run).is_file()
    assert (run / "evaluation.db").is_file() and not _has_sentinel(run / "evaluation.db")


def test_a_second_open_does_not_extract_again(client, archived_clone, monkeypatch):  # noqa: F811
    calls = []
    real = run_archive._extract
    monkeypatch.setattr(run_archive, "_extract", lambda *a, **k: calls.append(a) or real(*a, **k))
    first = _open(client)
    assert _open(client) == first
    assert len(calls) == 1


def _porcelain(url: str) -> list[str]:
    return [line for line in _git("status", "--porcelain", "-uall", cwd=shared_repo_path(url)).splitlines() if line]


def test_git_status_shows_only_the_unpacked_logs(client, archived_clone):  # noqa: F811
    url, _run = archived_clone
    client.get("/api/shared/projects")
    _open(client)
    _open(client, _FULL)
    ok, _reason = refresh_shared_clone(url)
    assert ok
    _open(client)
    allowed = re.compile(rf"^\?\? evaluations/proj-a/{_ARCHIVED}/(events\.jsonl|evidence/[^/]+_evidence\.jsonl)$")
    assert [line for line in _porcelain(url) if not allowed.match(line)] == []


def test_the_archived_run_still_opens_after_a_refresh(client, archived_clone, monkeypatch):  # noqa: F811
    url, run = archived_clone
    first = _open(client)
    calls = []
    real = run_archive._extract
    monkeypatch.setattr(run_archive, "_extract", lambda *a, **k: calls.append(a) or real(*a, **k))
    ok, reason = refresh_shared_clone(url)
    assert ok, reason
    assert _open(client) == first
    assert calls == []  # the archive did not change, so neither did the unpacked logs
    (run / "events.jsonl").unlink()
    assert _open(client) == first and len(calls) == 1
    assert not _has_sentinel(run / "evaluation.db")


def test_a_force_added_database_is_never_opened(client, shared_clone_fixture, tmp_path):  # noqa: F811
    url = shared_clone_fixture
    _publish_from_scratch(url, tmp_path, force_db=True)
    run = shared_evaluations_root(url) / "proj-a" / _FULL
    assert _has_sentinel(run / "evaluation.db")
    body = _open(client, _FULL)
    assert body["total"] >= 1
    assert local_db_marker(run).is_file() and not _has_sentinel(run / "evaluation.db")
    ok, reason = refresh_shared_clone(url)  # the reset checks the tracked database out again
    assert ok, reason
    assert not local_db_marker(run).exists()
    assert _open(client, _FULL) == body
    assert local_db_marker(run).is_file() and not _has_sentinel(run / "evaluation.db")


def test_two_readers_opening_the_archived_run_extract_once(app, archived_clone, monkeypatch):  # noqa: F811
    calls = []
    real = run_archive._extract
    monkeypatch.setattr(run_archive, "_extract", lambda *a, **k: calls.append(a) or real(*a, **k))
    barrier = threading.Barrier(2)
    bodies: list[dict] = []
    errors: list[BaseException] = []

    def reader():
        try:
            with app.test_client() as c:
                barrier.wait(timeout=budget(10))
                bodies.append(_open(c))
        except BaseException as exc:  # noqa: BLE001 -- surfaced by the assertion below
            errors.append(exc)

    threads = [threading.Thread(target=reader) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=budget(60))
    assert errors == []
    assert len(bodies) == 2 and bodies[0] == bodies[1] and bodies[0]["total"] >= 1
    assert len(calls) == 1
