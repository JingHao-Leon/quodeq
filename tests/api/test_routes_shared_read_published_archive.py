"""A run machine A publishes in archive form reads on machine B, and B's own publish stays clean.

Machine A is a second cache root (its own clone of the same origin) that
publishes a project whose old run is archived locally. Machine B is the
configured clone: it refreshes, lists the run without unpacking it, opens it,
then publishes a project of its own.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, archive_run, is_archived
from quodeq.data.fs.shared_clone_runs import unpacked_marker
from quodeq.data.fs.shared_repo import refresh_shared_clone, shared_evaluations_root, shared_repo_path
from quodeq.services.shared_publish import publish_project
from tests.api._routes_shared_read_fixtures import app, client, wait_shared_warmup_idle  # noqa: F401 -- fixtures
from tests.api.conftest import _EVAL_JSON
from tests.services._archive_fixtures import PROJECT, make_run
from tests._timeouts import budget


def _head_files(repo: Path) -> list[str]:
    out = subprocess.run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=repo, check=True,
                         capture_output=True, text=True, timeout=budget(30)).stdout
    return [line for line in out.splitlines() if line]


def _run(root: Path, run_id: str, days: int) -> Path:
    run = make_run(root, run_id, dimension="Security", days=days)
    eval_json = {**_EVAL_JSON, "project": PROJECT, "runId": run_id}
    (run / "evaluation" / "Security.json").write_text(json.dumps(eval_json), encoding="utf-8")
    return run


def _publish_from_machine_a(url: str, tmp_path: Path) -> None:
    root = tmp_path / "machine-a-evaluations"
    archive_run(_run(root, "run-old", 300))
    _run(root, "run-new", 5)
    env = {**os.environ, "QUODEQ_CACHE_ROOT": str(tmp_path / "machine-a-cache")}
    publish_project(PROJECT, url, evaluations_root=root, env=env)


def _own_project(tmp_path: Path) -> Path:
    root = tmp_path / "machine-b-evaluations"
    run = root / "proj-b" / "run-1"
    run.mkdir(parents=True)
    (run / "status.json").write_text(json.dumps({"state": "done", "schema_version": 2}))
    (run / "events.jsonl").write_text("{}\n")
    return root


def test_machine_b_lists_and_opens_an_archive_form_run_then_publishes_cleanly(client, shared_clone_fixture, tmp_path):  # noqa: F811
    url = shared_clone_fixture
    _publish_from_machine_a(url, tmp_path)
    ok, reason = refresh_shared_clone(url)
    assert ok, reason
    run = shared_evaluations_root(url) / PROJECT / "run-old"
    assert is_archived(run) and not (run / "evaluation.db").exists()

    resp = client.get(f"/api/shared/projects/{PROJECT}/runs")
    assert {"run-old", "run-new"} <= {r.get("runId") for r in resp.get_json()["runs"]}
    wait_shared_warmup_idle()
    assert not (run / "events.jsonl").exists() and not unpacked_marker(run).exists()

    opened = client.get(f"/api/shared/projects/{PROJECT}/violations?run=run-old")
    assert opened.status_code == 200 and opened.get_json()["total"] >= 1, opened.get_data(as_text=True)
    assert (run / "events.jsonl").is_file() and (run / ARCHIVE_FILENAME).is_file()

    publish_project("proj-b", url, evaluations_root=_own_project(tmp_path))
    files = _head_files(shared_repo_path(url))
    assert files and all(f.startswith("evaluations/proj-b/") for f in files), files
