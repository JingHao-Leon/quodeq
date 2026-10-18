"""Shared builders for the archive tests: a finished, projected run and a corrupt archive."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.data.fs import run_archive
from quodeq.data.projection.grade_projector import recompute_grades
from quodeq.data.fs.run_archive import archive_run
from tests.api._scores_routes_helpers import _scorable_violations, _seed_run

PROJECT = "proj"
NOW = datetime(2026, 10, 17, tzinfo=timezone.utc)


def make_run(
    root: Path, run_id: str, *, n: int = 5, dimension: str = "security", days: int = 300, snippet: str | None = None,
) -> Path:
    """A finished, projected run; *snippet* goes on its first finding (R0 in f0.py, line 10)."""
    violations = _scorable_violations(n, dimension=dimension)
    if snippet is not None:
        violations[0]["snippet"] = snippet
    run = _seed_run(root, PROJECT, run_id, violations)
    started = (NOW - timedelta(days=days)).isoformat()
    (run / "status.json").write_text(json.dumps({"state": "done", "started_at": started}))
    (run / "evaluation").mkdir()
    (run / "evaluation" / f"{dimension}.json").write_text(json.dumps({
        "dimension": dimension, "overallScore": 50, "overallGrade": "C",
        "principles": [], "violations": [], "totals": {"violations": n},
    }))
    return run


def freeze_grades(run: Path) -> Path:
    """Bake the run's grade tables (the warm-up does this for every real run), so an archive carries frozen grades."""
    recompute_grades(run, params=DEFAULT_PARAMS)
    return run


def corrupt(run: Path) -> None:
    archive_run(run)
    (run / run_archive.ARCHIVE_FILENAME).write_bytes(b"not a tarball")
