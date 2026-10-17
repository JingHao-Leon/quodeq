"""Pulling an archived run from a shared clone gives a plain local archived run.

The clone side holds the archive plus the files a previous open unpacked beside
it, restore markers and a planted database. None of that may arrive locally.
"""
from __future__ import annotations

import json
import shutil
import uuid

import pytest

from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, archive_run, is_archived
from quodeq.data.fs.run_scalars import SCALARS_NAME, read_scalars
from quodeq.data.fs.shared_repo import refresh_shared_clone, shared_evaluations_root
from quodeq.services.shared_publish import publish_project
from quodeq.services.shared_settings import SharedSettings, write_settings
from tests.api._routes_shared_read_fixtures import app, client, wait_shared_warmup_idle  # noqa: F401 -- fixtures
from tests.api.conftest import _make_origin
from tests.api.test_shared_pull import _pull, local_eval_dir, pull_slot  # noqa: F401 -- fixtures
from tests.services._archive_fixtures import PROJECT, make_run

_MARKERS = (".unpacked", ".restored_at", ".archive.lock", ".local_db")


@pytest.fixture()
def opened_remote_archive(tmp_path, monkeypatch):
    """A clone holding one archived run, already opened once so its unpacked copies sit beside the archive."""
    for var in ("GIT_AUTHOR_NAME", "GIT_COMMITTER_NAME"):
        monkeypatch.setenv(var, "tester")
    for var in ("GIT_AUTHOR_EMAIL", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t@t")
    url = _make_origin(tmp_path)
    root, pid = tmp_path / "source", str(uuid.uuid4())
    archive_run(make_run(root, "run-old", days=300))
    (root / PROJECT / "repository_info.json").write_text(json.dumps(
        {"uuid": pid, "name": "proj-a", "location": "local", "path": "/tmp/proj-a"}))
    shutil.move(str(root / PROJECT), str(root / pid))
    publish_project(pid, url, evaluations_root=root)
    write_settings(SharedSettings(url=url))
    ok, reason = refresh_shared_clone(url)
    assert ok, reason
    return url, pid, root / pid / "run-old"


def _open_in_clone(client, pid):  # noqa: F811
    resp = client.get(f"/api/shared/projects/{pid}/violations?run=run-old")
    assert resp.status_code == 200, resp.get_data(as_text=True)
    wait_shared_warmup_idle()


def test_pulled_archived_run_is_a_plain_local_archived_run(client, opened_remote_archive, local_eval_dir, pull_slot):  # noqa: F811
    url, pid, source_run = opened_remote_archive
    remote_run = shared_evaluations_root(url) / pid / "run-old"
    _open_in_clone(client, pid)
    assert (remote_run / "events.jsonl").is_file() and (remote_run / ARCHIVE_FILENAME).is_file()
    (remote_run / "evaluation.db").write_bytes(b"planted")
    assert _pull(client, pid).status_code == 202

    local_run = local_eval_dir / pid / "run-old"
    assert is_archived(local_run) and (local_run / SCALARS_NAME).is_file()
    present = {p.name for p in local_run.iterdir()}
    assert not present & {"events.jsonl", "evaluation.db", *_MARKERS, ".restore.tmp"}, present
    assert not list(local_run.glob("evidence/*_evidence.jsonl"))
    assert read_scalars(local_run) == read_scalars(source_run)


def test_pulled_archived_run_lists_and_opens_locally(client, opened_remote_archive, local_eval_dir, pull_slot):  # noqa: F811
    url, pid, source_run = opened_remote_archive
    _open_in_clone(client, pid)
    assert _pull(client, pid).status_code == 202
    local_run = local_eval_dir / pid / "run-old"

    runs = client.get(f"/api/projects/{pid}/runs").get_json()["runs"]
    assert [r["runId"] for r in runs] == ["run-old"]
    assert is_archived(local_run)  # listing leaves it packed
    opened = client.get(f"/api/projects/{pid}/runs/run-old/violations")
    assert opened.status_code == 200, opened.get_data(as_text=True)
    assert not is_archived(local_run) and (local_run / "events.jsonl").is_file() and (local_run / "evaluation.db").is_file()


def test_local_export_import_without_database_still_lists_and_scores(client, tmp_path, monkeypatch):  # noqa: F811
    from quodeq.services.project_archive_export import build_project_zip
    from quodeq.services.project_import import import_zip_stream
    src, pid = tmp_path / "src", str(uuid.uuid4())
    make_run(src, "run-1", days=5)
    (src / PROJECT / "repository_info.json").write_text(json.dumps(
        {"uuid": pid, "name": "p", "location": "local", "path": "/tmp/p"}))
    shutil.move(str(src / PROJECT), str(src / pid))
    assert (src / pid / "run-1" / "evaluation.db").is_file()
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(src))
    before = client.get(f"/api/projects/{pid}/runs").get_json()["runs"]
    dest = tmp_path / "dest"
    dest.mkdir()
    zip_path = build_project_zip(src / pid)
    with zip_path.open("rb") as stream:
        assert import_zip_stream(stream, str(dest), None).status == 200
    assert not (dest / pid / "run-1" / "evaluation.db").exists()
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(dest))
    after = client.get(f"/api/projects/{pid}/runs").get_json()["runs"]
    assert before and after == before
    assert client.get(f"/api/projects/{pid}/runs/run-1/violations").status_code == 200
