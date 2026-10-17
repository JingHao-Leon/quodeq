"""An archived run (no events.jsonl, no evaluation.db) is never read as legacy."""
from __future__ import annotations

import json
from pathlib import Path

from quodeq.data.fs import run_files
from quodeq.data.fs.report_parser import runs as runs_mod
from quodeq.data.fs.run_archive import archive_run
from quodeq.services import grade_formula, mutation_rescore
from tests.api._scores_routes_helpers import _scorable_violations, _seed_run


def _archived(tmp_path: Path) -> Path:
    run = _seed_run(tmp_path, "proj", "run-1", _scorable_violations())
    (run / "status.json").write_text(json.dumps({"state": "completed"}))
    return run


def test_formula_apply_still_counts_an_archived_run(tmp_path):
    run = _archived(tmp_path)
    archive_run(run)
    assert grade_formula.count_rescorable_runs(tmp_path) == 1


def test_dismiss_projection_leaves_an_archived_run_packed(tmp_path):
    """It catches up from the action log when it is next opened (test_run_archive_frozen_reads)."""
    run = _archived(tmp_path)
    archive_run(run)
    seen: list[Path] = []

    class Repo:
        def __init__(self, run_dir: Path) -> None:
            seen.append(run_dir)

        def ensure_projected(self) -> None:
            pass

    mutation_rescore.project_all_runs(tmp_path / "proj", repo_factory=Repo)
    assert seen == []


def test_run_listing_keeps_an_archived_run(tmp_path):
    run = _archived(tmp_path)
    archive_run(run)
    assert [r.run_id for r in runs_mod.list_runs(tmp_path, "proj")] == ["run-1"]


def test_archiving_changes_the_run_fingerprint(tmp_path):
    run = _archived(tmp_path)
    before = run_files.run_fingerprint(run)
    archive_run(run)
    assert run_files.run_fingerprint(run) != before
