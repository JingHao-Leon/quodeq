"""Archiving a run changes nothing a reader sees: every deep read restores it first."""
from __future__ import annotations

import dataclasses
import json
import logging
import shutil
from pathlib import Path

import pytest

from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.data.events.reader import EventLogReader
from quodeq.data.fs import run_archive
from quodeq.data.fs.run_files import dimension_evidence_file
from quodeq.data.fs.run_archive import archive_run, is_archived
from quodeq.data.sqlite.connection import open_evaluation_db
from quodeq.data.sqlite.findings_repository import SqliteFindingsRepository
from quodeq.data.sqlite.state_store import SQLiteStateStore
from quodeq.services import grade_formula
from quodeq.services.run_event_readers import read_new_findings_from_events
from quodeq.services.scoring import get_scores_raw, make_scoring_trend_fetcher
from tests.api._scores_routes_helpers import _scorable_violations, _seed_run
from tests.services._grade_formula_fixtures import formula_path  # noqa: F401 -- pytest fixture

_PROJECT = "proj"
_OLD, _NEW = "run-old", "run-new"
_TUNED = dataclasses.replace(
    DEFAULT_PARAMS, severity_weight={"critical": 4.0, "major": 3.5, "minor": 0.25},
)


@pytest.fixture
def scores_env(tmp_path, monkeypatch):
    """A private score cache, so a trend read never serves a row persisted earlier."""
    def use_cache(name: str) -> None:
        monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / f"{name}.db"))
    use_cache("before")
    return use_cache


def _seed_project(root: Path) -> tuple[Path, Path]:
    """An older run (to archive) and a newer live one, both finished."""
    runs = []
    for run_id, n in ((_OLD, 5), (_NEW, 7)):
        run = _seed_run(root, _PROJECT, run_id, _scorable_violations(n, dimension="security"))
        (run / "status.json").write_text(json.dumps({"state": "completed"}))
        (run / "evaluation").mkdir()
        (run / "evaluation" / "security.json").write_text(json.dumps({
            "dimension": "security", "overallScore": 50, "overallGrade": "C",
            "principles": [], "violations": [], "totals": {"violations": n},
        }))
        runs.append(run)
    return runs[0], runs[1]


def test_scores_of_an_archived_run_are_unchanged(tmp_path, scores_env):
    old, _ = _seed_project(tmp_path)
    before = get_scores_raw(tmp_path, _PROJECT, _OLD)
    archive_run(old)

    assert get_scores_raw(tmp_path, _PROJECT, _OLD) == before
    assert not is_archived(old)


def test_history_trend_is_unchanged_after_archiving(tmp_path, scores_env):
    old, _ = _seed_project(tmp_path)

    def trend() -> dict[str, list]:
        fetch = make_scoring_trend_fetcher(tmp_path, _PROJECT)
        return {
            run_id: [(d.dimension, d.overall_score, d.overall_grade) for d in fetch(run_id)]
            for run_id in (_OLD, _NEW)
        }

    before = trend()
    archive_run(old)
    scores_env("after")

    assert trend() == before
    assert before[_OLD]


def test_formula_apply_rescores_an_archived_run(tmp_path, formula_path):  # noqa: F811
    archived_root, plain_root = tmp_path / "archived", tmp_path / "plain"
    old, _ = _seed_project(archived_root)
    shutil.copytree(archived_root, plain_root)
    archive_run(old)

    grade_formula.save_params(_TUNED)
    for root in (archived_root, plain_root):
        result = grade_formula.apply_to_all_runs(root)
        assert result.failed == []

    archived = SQLiteStateStore(old).read_dimension_scores()
    plain = SQLiteStateStore(plain_root / _PROJECT / _OLD).read_dimension_scores()
    assert archived and archived == plain


def test_findings_of_an_archived_run_are_readable(tmp_path):
    old, _ = _seed_project(tmp_path)
    before = SqliteFindingsRepository(old).list_by_dimension("security")
    archive_run(old)

    assert SqliteFindingsRepository(old).list_by_dimension("security") == before
    assert len(before) == 5


def test_a_corrupt_archive_reads_as_a_run_without_an_event_log(tmp_path, caplog):
    old, _ = _seed_project(tmp_path)
    archive_run(old)
    (old / run_archive.ARCHIVE_FILENAME).write_bytes(b"not a tarball")

    with caplog.at_level(logging.WARNING):
        result = get_scores_raw(tmp_path, _PROJECT, _OLD)
        findings = SqliteFindingsRepository(old).list_by_dimension("security")

    assert [d["overallGrade"] for d in result["dimensions"]] == ["C"]  # the report, not the SQL tables
    assert findings == []
    assert is_archived(old)
    assert "run archive" in caplog.text


def test_a_lock_timeout_during_restore_is_a_warning(tmp_path, monkeypatch, caplog):
    old, _ = _seed_project(tmp_path)
    archive_run(old)

    def stuck(_run_dir):
        raise TimeoutError("lock wait")

    monkeypatch.setattr(run_archive, "ensure_restored", stuck)
    with caplog.at_level(logging.WARNING):
        findings = SqliteFindingsRepository(old).list_by_dimension("security")

    assert findings == []
    assert is_archived(old)
    assert "lock wait" in caplog.text


def test_event_and_evidence_readers_restore_an_archived_run(tmp_path):
    old, _ = _seed_project(tmp_path)
    (old / "evidence").mkdir()
    (old / "evidence" / "security_evidence.jsonl").write_text('{"x": 1}\n')
    events_before = [e.payload for e in EventLogReader(old / "events.jsonl").stream()]
    archive_run(old)
    assert not (old / "evidence" / "security_evidence.jsonl").exists()

    assert dimension_evidence_file(old, "security").read_text() == '{"x": 1}\n'
    archive_run(old)
    assert [e.payload for e in EventLogReader(old / "events.jsonl").stream()] == events_before
    archive_run(old)
    assert len(read_new_findings_from_events(old, None, 0)) == len(events_before) == 5


def test_opening_an_archived_run_database_restores_before_connecting(tmp_path):
    old, _ = _seed_project(tmp_path)
    archive_run(old)

    with open_evaluation_db(old) as conn:
        conn.execute("SELECT 1")

    assert (old / "events.jsonl").is_file() and not is_archived(old)
