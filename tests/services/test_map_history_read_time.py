"""Suppression and the grade formula apply when the map history is read, never by rebuilding a cached run."""
import dataclasses
import json

from quodeq.services import map_history
from quodeq.services.map_history import build_map_history
from tests.services._map_history_fixtures import (  # noqa: F401 -- env/cached_runs are pytest fixtures
    _run, _two_runs, _violation, cached_runs, env,
)


def _two_findings(env) -> None:
    p = env / "proj"
    for rid, day in (("r1", "2026-09-01"), ("r2", "2026-09-08")):
        _run(p, rid, day, {"security": [_violation("x/a.py", req="R1", snip="a()"),
                                        {**_violation("x/b.py", req="R2", snip="b()"), "principle": "Secure Design"}]})


def _count_reads(monkeypatch) -> list:
    reads = []
    real = map_history.iter_readable_eval_reports
    monkeypatch.setattr(map_history, "iter_readable_eval_reports", lambda d: reads.append(d) or real(d))
    return reads


def test_a_dismissal_applies_to_every_run_without_reading_a_report(env, monkeypatch):
    from quodeq.services.dismissed import dismiss_finding
    _two_findings(env)
    build_map_history(env, "proj", frames="all")
    reads = _count_reads(monkeypatch)
    dismiss_finding(env / "proj", {"req": "R1", "file": "x/a.py", "line": 1, "snippet": "a()"})
    out = build_map_history(env, "proj", frames="all")
    assert reads == []
    assert "x/a.py" not in out.file_names and "x/b.py" in out.file_names


def test_a_deletion_and_a_rule_apply_without_reading_a_report(env, monkeypatch):
    from quodeq.services.deleted import delete_finding
    _two_findings(env)
    build_map_history(env, "proj")
    reads = _count_reads(monkeypatch)
    delete_finding(env / "proj", {"dimension": "security", "principle": "Secure Design", "file": "x/b.py"})
    (env / "proj" / "suppression_rules.json").write_text(json.dumps(
        {"version": 1, "rules": [{"req": "R1", "file": "x/*", "reason": "fixture"}]}))
    assert build_map_history(env, "proj").file_names == ()
    assert reads == []


def test_a_new_grade_formula_reweighs_without_reading_a_report(env, monkeypatch):
    _two_runs(env)
    first = build_map_history(env, "proj")
    reads = _count_reads(monkeypatch)
    real_load = map_history.ProjectRows.load

    def heavier(root, project, **kw):
        rows = real_load(root, project, **kw)
        weights = {"critical": 4.0, "major": 10.0, "minor": 0.25}
        return dataclasses.replace(rows, params=dataclasses.replace(rows.params, severity_weight=weights))
    monkeypatch.setattr(map_history.ProjectRows, "load", heavier)
    out = build_map_history(env, "proj")
    assert (first.frames[-1].files[0].weight, out.frames[-1].files[0].weight) == (2.0, 10.0)
    assert reads == []


def test_the_cache_key_holds_only_the_shape_and_the_dimensions(env, cached_runs, monkeypatch):
    keys_seen = []
    real = map_history.load_map_snapshots
    monkeypatch.setattr(map_history, "load_map_snapshots", lambda project, keys: keys_seen.append(keys) or real(project, keys))
    _two_runs(env)
    build_map_history(env, "proj")
    assert set(keys_seen[0].values()) == {f"{map_history.SNAPSHOT_SHAPE}|maintainability,security"}


def test_a_run_cached_under_an_older_shape_is_rebuilt(env, monkeypatch):
    shape = map_history.SNAPSHOT_SHAPE
    _two_runs(env)
    monkeypatch.setattr(map_history, "SNAPSHOT_SHAPE", "2")
    first = build_map_history(env, "proj", frames="all")
    monkeypatch.setattr(map_history, "SNAPSHOT_SHAPE", shape)
    calls = []
    real = map_history.build_raw_run
    monkeypatch.setattr(map_history, "build_raw_run", lambda *a, **kw: calls.append(1) or real(*a, **kw))
    assert build_map_history(env, "proj", frames="all") == first
    assert len(calls) == 2


def test_a_garbled_stored_record_is_rebuilt_not_a_failure(env):
    from quodeq.data.sqlite.score_cache_db import open_score_cache
    from quodeq.services.dismissed import dismiss_finding
    _two_findings(env)
    first = build_map_history(env, "proj", frames="all")
    with open_score_cache() as conn:
        rows = conn.execute("SELECT rec, payload FROM map_finding").fetchall()
        for rec, payload in rows:
            garbled = json.loads(payload)
            garbled[5] = []
            conn.execute("UPDATE map_finding SET payload=? WHERE rec=?", (json.dumps(garbled), rec))
        conn.commit()
    dismiss_finding(env / "proj", {"req": "R9", "file": "x/z.py", "line": 1, "snippet": "z()"})
    assert build_map_history(env, "proj", frames="all") == first
    assert build_map_history(env, "proj", frames="all") == first
