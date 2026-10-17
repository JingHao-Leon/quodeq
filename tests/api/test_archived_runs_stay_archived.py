"""Routine reads never restore an archived run: listings, trends, warm-up and project-wide mutations.

Opening one run (a ``/runs/<run_id>/...`` route) restores it by design; every
other read serves an archived run from its sidecars and leaves it packed.
"""
from __future__ import annotations

import json
import re
import threading

import pytest

from quodeq.api.app import create_app
from quodeq.core.observability import NULL_LOG
from quodeq.data.fs.run_archive import RESTORED_STAMP, is_archived
from quodeq.services import scoring, warmup
from quodeq.services.mutation_rescore import project_all_runs
from quodeq.services.storage_cleanup import archive_keeping_keys
from tests._timeouts import budget
from tests.services._archive_fixtures import PROJECT, make_run

_OLD = ("20250101", "20250601")
_LIVE = "20261001"
_KEY = {"req": "R1", "file": "f1.py", "line": 11}  # present in every run (see _scorable_violations)
_SKIP = ("stream", "/events", "/export")  # streams never end; export zips the folder as it is
_LOCALHOST = {"Origin": "http://localhost"}  # the CSRF guard wants a same-origin POST
_EXTRA_GETS = ("/api/projects", "/api/storage", "/api/fleet/compare",
               f"/api/findings/dismissed?project={PROJECT}", f"/api/findings/verified?project={PROJECT}")


@pytest.fixture
def env(tmp_path, monkeypatch):
    root = tmp_path / "evaluations"
    monkeypatch.delenv("QUODEQ_API_KEY", raising=False)
    monkeypatch.setenv("QUODEQ_DIR", str(tmp_path / "qdir"))
    monkeypatch.setenv("QUODEQ_EVALUATIONS_DIR", str(root))
    monkeypatch.setenv("QUODEQ_INDEX_DB_PATH", str(tmp_path / "index.db"))
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "score_cache.db"))
    runs = [make_run(root, run_id, days=days) for run_id, days in ((_OLD[0], 600), (_OLD[1], 400), (_LIVE, 10))]
    old = runs[:2]
    client = create_app(static_dist=None, api_key=None).test_client()
    return root, old, client


def _archive(runs) -> None:
    """Archive as storage cleanup does: the run's finding keys are kept in the score cache first."""
    for run in runs:
        if not is_archived(run):
            archive_keeping_keys(run, NULL_LOG)


def _assert_still_archived(runs, what: str) -> None:
    for run in runs:
        assert is_archived(run), f"{what} restored {run.name}"
        assert not (run / RESTORED_STAMP).exists(), f"{what} stamped {run.name} warm"


def _project_get_urls(app) -> list[str]:
    urls = []
    for rule in sorted(app.url_map.iter_rules(), key=lambda r: r.rule):
        path = rule.rule
        if "GET" not in rule.methods or not re.match(r"/api/projects/<[^>]*project[^>]*>", path):
            continue
        if "<run" in path or any(s in path for s in _SKIP):
            continue
        url = re.sub(r"<[^>]*project[^>]*>", PROJECT, path)
        urls.append(re.sub(r"<[^>]+>", "security", url))
    return urls


def _routes_that_restore(client, old) -> list[str]:
    urls = _project_get_urls(client.application)
    assert f"/api/projects/{PROJECT}/runs" in urls
    urls += [f"/api/projects/{PROJECT}/dashboard?view=overview", *_EXTRA_GETS]
    restored = []
    for url in urls:
        _archive(old)
        client.get(url)
        if not all(is_archived(run) and not (run / RESTORED_STAMP).exists() for run in old):
            restored.append(url)
    return restored


def test_every_project_read_leaves_archived_runs_packed(env):
    _root, old, client = env
    assert _routes_that_restore(client, old) == []


def test_warmup_and_a_cold_trend_leave_archived_runs_packed(env, tmp_path, monkeypatch):
    root, old, _client = env
    _archive(old)
    engine = warmup.WarmupEngine()  # the startup warm-up, on its own worker thread
    try:
        engine.start(str(root))
        pause = threading.Event()
        for _ in range(int(budget(10) / 0.01)):
            if not engine.snapshot()["active"]:
                break
            pause.wait(0.01)
        assert engine.snapshot()["projectsDone"] == 1
    finally:
        engine.stop()
    _assert_still_archived(old, "startup warm-up")
    warmup.warm_project(str(root), PROJECT, overview=True)
    _assert_still_archived(old, "warm-up with the Overview")
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "cold.db"))
    fetch = scoring.make_scoring_trend_fetcher(root, PROJECT)
    trend = {run.name: fetch(run.name) for run in old}
    _assert_still_archived(old, "cold trend")
    assert all(trend.values())


def test_dismiss_and_restore_all_leave_archived_runs_packed(env):
    root, old, client = env
    _archive(old)
    for body in ({"project": PROJECT, **_KEY, "run_id": _LIVE}, {"project": PROJECT, **_KEY}):
        assert client.post("/api/findings/dismiss", json=body, headers=_LOCALHOST).status_code == 200
        project_all_runs(root / PROJECT)  # the no-run_id fallback, run inline
        _assert_still_archived(old, f"dismiss {body}")
    assert _routes_that_restore(client, old) == []  # every read after a dismissal touching them
    _assert_still_archived(old, "reads after a dismissal")
    assert client.post("/api/findings/restore-all", json={"project": PROJECT}, headers=_LOCALHOST).status_code == 200
    project_all_runs(root / PROJECT)
    _assert_still_archived(old, "restore-all")


def test_the_run_log_change_fill_leaves_archived_runs_packed(env):
    """History and the Overview header fill each run's change data; that read never restores a run."""
    _root, old, client = env
    for run in old:  # a run that names its dimensions has a per-dimension progress row to fill
        status = json.loads((run / "status.json").read_text())
        (run / "status.json").write_text(json.dumps({**status, "dimensions": ["security"]}))
    _archive(old)
    assert client.get(f"/api/projects/{PROJECT}/runs/log").status_code == 200
    assert client.application.extensions["run_change_filler"].wait_idle(budget(10))
    _assert_still_archived(old, "the run log change fill")


def test_the_previous_period_scores_read_leaves_an_archived_run_packed(env):
    """The dimension page compares with the run that closed the previous period: a comparison, not an open."""
    _root, old, client = env
    _archive(old)

    resp = client.get(f"/api/projects/{PROJECT}/scores/{old[0].name}?archived=keep")

    assert resp.status_code == 200
    assert [d["dimension"] for d in resp.get_json()["dimensions"]] == ["security"]
    _assert_still_archived(old, "the previous-period scores read")
