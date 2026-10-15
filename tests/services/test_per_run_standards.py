"""Each run's cache version folds in only the standards that run scored.

Adding or installing a standard, or starting the first run of one, leaves
every older run's version alone; editing a standard rebuilds only the runs
that scored it; renaming or rewording it rebuilds nothing (Victor, 2026-10-15).
"""
from __future__ import annotations

import json
import os

import pytest

from quodeq.core.run.state import RunState
from quodeq.core.scoring.params import DEFAULT_PARAMS
from quodeq.services import standards_version as sv
from quodeq.services.score_cache import per_run_versions
from quodeq.services.suppression_keys import SuppressionKeys

_NO_KEYS = SuppressionKeys(set(), set())


@pytest.fixture(autouse=True)
def _iso(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "sc.db"))
    compiled = tmp_path / "compiled"
    evaluators = tmp_path / "evaluators"
    compiled.mkdir()
    evaluators.mkdir()
    _standard(compiled, "security", ["S1"])
    _standard(evaluators, "android", ["A1"])
    monkeypatch.setattr(sv, "standard_dirs", lambda: (compiled, evaluators))


def _standard(directory, sid, principles, *, name=None):
    path = directory / f"{sid}.json"
    payload = {"id": sid, "name": name or sid, "description": "d",
               "principles": [{"id": p, "requirements": [{"id": f"{p}-R1"}]} for p in principles]}
    path.write_text(json.dumps(payload), encoding="utf-8")
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 2_000_000_000))


def _run(project_dir, run_id, *dims):
    evaluation = project_dir / run_id / "evaluation"
    evaluation.mkdir(parents=True)
    for dim in dims:
        (evaluation / f"{dim}.json").write_text("{}", encoding="utf-8")


def _versions(project_dir, *run_ids):
    runs = [(rid, RunState.DONE) for rid in run_ids]
    return {rid: v for rid, _, v in per_run_versions(project_dir, "proj", DEFAULT_PARAMS, runs, keys=_NO_KEYS)}


def test_editing_a_standard_rebuilds_only_the_runs_that_scored_it(tmp_path):
    pd = tmp_path / "proj"
    _run(pd, "r-sec", "security")
    _run(pd, "r-and", "android")
    before = _versions(pd, "r-sec", "r-and")
    _standard(tmp_path / "evaluators", "android", ["A1", "A2"])
    after = _versions(pd, "r-sec", "r-and")
    assert after["r-sec"] == before["r-sec"]
    assert after["r-and"] != before["r-and"]


def test_first_run_of_a_new_standard_leaves_older_runs_alone(tmp_path):
    pd = tmp_path / "proj"
    _run(pd, "r-old", "security")
    before = _versions(pd, "r-old")["r-old"]
    _standard(tmp_path / "evaluators", "go-services", ["G1"])
    evidence = pd / "r-new" / "evidence"
    evidence.mkdir(parents=True)
    (evidence / "go-services_evidence.jsonl").write_text("", encoding="utf-8")
    assert _versions(pd, "r-old")["r-old"] == before


def test_renaming_or_rewording_a_scored_standard_rebuilds_nothing(tmp_path):
    pd = tmp_path / "proj"
    _run(pd, "r-and", "android")
    before = _versions(pd, "r-and")["r-and"]
    _standard(tmp_path / "evaluators", "android", ["A1"], name="Android Kotlin Best Practices")
    assert _versions(pd, "r-and")["r-and"] == before


def test_deleting_a_scored_standard_rebuilds_its_runs(tmp_path):
    pd = tmp_path / "proj"
    _run(pd, "r-and", "android")
    before = _versions(pd, "r-and")["r-and"]
    (tmp_path / "evaluators" / "android.json").unlink()
    assert _versions(pd, "r-and")["r-and"] != before


def test_unchanged_run_folders_are_not_listed_again(tmp_path, monkeypatch):
    pd = tmp_path / "proj"
    _run(pd, "r-sec", "security")
    _versions(pd, "r-sec")
    calls = []
    real = sv.run_dimension_ids
    monkeypatch.setattr(sv, "run_dimension_ids", lambda run_dir: calls.append(run_dir) or real(run_dir))
    _versions(pd, "r-sec")
    assert sv.standards_fingerprint(pd)
    assert calls == []
