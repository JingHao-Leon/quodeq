"""Storage cleanup leaves a restored run warm, and re-checks for live runs before each archive."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

from quodeq.data.fs.run_archive import archive_run, ensure_restored
from quodeq.data.fs.run_archive_guard import RESTORED_STAMP
from quodeq.services import storage_cleanup
from quodeq.services.storage_cleanup import plan_cleanup, run_cleanup

NOW = datetime.now(timezone.utc)


def _run(root, name, days, *, state="done"):
    run_dir = root / "p" / name
    (run_dir / "evaluation").mkdir(parents=True)
    started = (NOW - timedelta(days=days)).isoformat()
    (run_dir / "status.json").write_text(json.dumps({"state": state, "started_at": started}))
    settled = (NOW - timedelta(days=days)).timestamp()  # finished long enough ago to tidy
    os.utime(run_dir / "status.json", (settled, settled))
    (run_dir / "evaluation" / "quality.json").write_text("{}")
    (run_dir / "events.jsonl").write_text("{}\n")
    return run_dir


def _archived_then_restored(tmp_path):
    old = _run(tmp_path, "old", 400)
    _run(tmp_path, "newer", 10)
    archive_run(old)
    assert ensure_restored(old) is True
    return old


def test_a_run_restored_today_is_not_archived_again(tmp_path):
    old = _archived_then_restored(tmp_path)
    assert old not in plan_cleanup(tmp_path, NOW, 1).archive
    assert run_cleanup(tmp_path, NOW, keep_runs=1).archived == 0
    assert not (old / "archive.tar.gz").exists()


def test_a_run_restored_long_ago_is_archived_again(tmp_path):
    old = _archived_then_restored(tmp_path)
    (old / RESTORED_STAMP).write_text((NOW - timedelta(days=200)).isoformat())
    assert plan_cleanup(tmp_path, NOW, 1).archive == (old,)
    assert run_cleanup(tmp_path, NOW, keep_runs=1).archived == 1
    assert (old / "archive.tar.gz").is_file() and not (old / RESTORED_STAMP).exists()


def test_a_run_that_starts_after_planning_stops_the_archive(tmp_path, monkeypatch):
    old = _run(tmp_path, "old", 300)
    _run(tmp_path, "newer", 10)
    real_tidy = storage_cleanup.tidy_run

    def tidy_while_a_run_starts(run_dir):
        if not (tmp_path / "p" / "live").exists():
            _run(tmp_path, "live", 0, state="running")
        return real_tidy(run_dir)

    monkeypatch.setattr(storage_cleanup, "tidy_run", tidy_while_a_run_starts)
    assert plan_cleanup(tmp_path, NOW, 1).archive == (old,)
    assert run_cleanup(tmp_path, NOW, keep_runs=1).archived == 0
    assert (old / "events.jsonl").is_file() and not (old / "archive.tar.gz").exists()
