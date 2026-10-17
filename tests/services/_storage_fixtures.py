"""Shared builders for the storage tests: run folders and a delete_project fake."""
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

NOW = datetime(2026, 10, 17, tzinfo=timezone.utc)


def make_run(root, project, name, days, *, state="done", dims=("quality",), log=True, pid=None):
    """A run folder with status.json started *days* before NOW, one report per dimension."""
    run_dir = root / project / name
    (run_dir / "evaluation").mkdir(parents=True)
    status = {"state": state, "started_at": (NOW - timedelta(days=days)).isoformat()}
    if pid is not None:
        status["pid"] = pid
    (run_dir / "status.json").write_text(json.dumps(status))
    settled = (NOW - timedelta(days=days)).timestamp()  # finished long enough ago to tidy
    os.utime(run_dir / "status.json", (settled, settled))
    for dim in dims:
        (run_dir / "evaluation" / f"{dim}.json").write_text("{}")
    if log:
        (run_dir / "events.jsonl").write_text("{}\n")
    return run_dir


class FakeProvider:
    """Records deletes and removes the project dir with its children, like delete_project."""

    def __init__(self):
        self.deleted: list[str] = []
        self.invalidated = False

    def delete_project(self, reports_dir, project):
        root = Path(reports_dir)
        if not (root / project).is_dir():
            return False
        self.deleted.append(project)
        for entry in root.iterdir():
            info = entry / "repository_info.json"
            if info.is_file() and json.loads(info.read_text()).get("parent") == project:
                shutil.rmtree(entry)
        shutil.rmtree(root / project)
        return True

    def invalidate_projects_cache(self):
        self.invalidated = True
