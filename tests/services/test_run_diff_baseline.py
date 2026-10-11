"""The default baseline is chosen per dimension: a finished run that has the report.

A cancelled partial run, or a run that never evaluated the dimension, must not
become the silent baseline: findings in files it never read would all count
as new.
"""
from __future__ import annotations

import json
from pathlib import Path

from quodeq.services.run_diff import diff_runs

_PROJECT = "p"
_DIM = "maintainability"
_OTHER_DIM = "security"


def _run(root: Path, run_id: str, started_at: str, state: str, dims: dict[str, list[dict]]) -> None:
    run_dir = root / _PROJECT / run_id
    (run_dir / "evaluation").mkdir(parents=True)
    for dim, violations in dims.items():
        (run_dir / "evaluation" / f"{dim}.json").write_text(json.dumps({
            "dimension": dim, "principles": [], "violations": violations, "compliance": []}),
            encoding="utf-8")
    (run_dir / "status.json").write_text(json.dumps({"state": state, "started_at": started_at}),
                                          encoding="utf-8")


def _v(req: str) -> dict:
    return {"req": req, "file": "a.py", "line": 1, "snippet": f"{req} snippet", "severity": "minor"}


def test_default_baseline_prefers_a_finished_run_with_the_dimension(tmp_path: Path) -> None:
    _run(tmp_path, "r-done-old", "2026-09-10T00:00:00Z", "done", {_DIM: [_v("M-REU-1")]})
    _run(tmp_path, "r-other-dim", "2026-09-15T00:00:00Z", "done", {_OTHER_DIM: [_v("S-CON-1")]})
    _run(tmp_path, "r-cancelled", "2026-09-20T00:00:00Z", "cancelled", {_DIM: []})
    _run(tmp_path, "r-curr", "2026-09-26T00:00:00Z", "done", {_DIM: [_v("M-REU-1")]})

    out = diff_runs(tmp_path, _PROJECT, "r-curr", None)

    dim = out["dimensions"][_DIM]
    assert dim["againstRunId"] == "r-done-old"
    assert dim["counts"]["same"] == 1 and dim["counts"]["new"] == 0


def test_default_baseline_falls_back_to_a_cancelled_run_when_no_finished_one_has_it(tmp_path: Path) -> None:
    _run(tmp_path, "r-cancelled", "2026-09-20T00:00:00Z", "cancelled", {_DIM: [_v("M-REU-1")]})
    _run(tmp_path, "r-curr", "2026-09-26T00:00:00Z", "done", {_DIM: [_v("M-REU-1")]})

    out = diff_runs(tmp_path, _PROJECT, "r-curr", None)

    assert out["dimensions"][_DIM]["againstRunId"] == "r-cancelled"


def test_no_baseline_is_signalled_per_dimension(tmp_path: Path) -> None:
    _run(tmp_path, "r-curr", "2026-09-26T00:00:00Z", "done", {_DIM: [_v("M-REU-1")]})

    out = diff_runs(tmp_path, _PROJECT, "r-curr", None)

    assert out["dimensions"][_DIM]["againstRunId"] is None
    assert out["againstRunId"] is None


def test_each_older_run_state_is_read_once_across_dimensions(tmp_path: Path, monkeypatch) -> None:
    from quodeq.services import run_diff  # noqa: PLC0415

    both = {_DIM: [_v("M-REU-1")], _OTHER_DIM: [_v("S-CON-1")]}
    _run(tmp_path, "r-old", "2026-09-10T00:00:00Z", "done", both)
    _run(tmp_path, "r-mid", "2026-09-15T00:00:00Z", "done", both)
    _run(tmp_path, "r-curr", "2026-09-26T00:00:00Z", "done", both)
    reads: list[str] = []
    original = run_diff._state_of
    monkeypatch.setattr(run_diff, "_state_of", lambda d: reads.append(d.name) or original(d))

    out = diff_runs(tmp_path, _PROJECT, "r-curr", None)

    assert {d["againstRunId"] for d in out["dimensions"].values()} == {"r-mid"}
    assert sorted(reads) == ["r-mid", "r-old"]


def _replayed_run(root: Path, run_id: str, started_at: str, violations: list[dict], compliance: list[dict]) -> None:
    """A run whose every file came from the analysis cache: violations carry the
    replay stamp, compliance entries carry none (the report path drops it)."""
    _run(root, run_id, started_at, "done", {_DIM: [{**v, "carried_forward": True} for v in violations]})
    report = root / _PROJECT / run_id / "evaluation" / f"{_DIM}.json"
    data = json.loads(report.read_text(encoding="utf-8"))
    data["compliance"] = compliance
    report.write_text(json.dumps(data), encoding="utf-8")


def test_a_file_named_only_by_replayed_compliance_counts_as_re_evaluated(tmp_path: Path) -> None:
    # A run that re-read no file can still resolve: the analysis cache is keyed
    # by file content (not by model), so a changed file evaluated by an earlier
    # run of another model is replayed with that verdict. Its compliance entry
    # names the file, so a violation gone from it is resolved, not unchecked.
    _replayed_run(tmp_path, "r-base", "2026-10-09T01:53:00+00:00",
                  [_v("R-FT-2"), {**_v("R-FT-4"), "file": "b.py"}], [])
    _replayed_run(tmp_path, "r-curr", "2026-10-10T01:36:36+00:00",
                  [], [{"req": "R-FT-2", "file": "a.py", "line": 161, "snippet": "ok"}])

    counts = diff_runs(tmp_path, _PROJECT, "r-curr", "r-base")["dimensions"][_DIM]["counts"]

    assert (counts["resolved"], counts["notReevaluated"]) == (1, 1)


def test_severity_tallies_cover_every_finding_past_the_list_cap(tmp_path: Path) -> None:
    from quodeq.core.run.run_log import summarise_diff
    from quodeq.services.run_diff import LIST_CAP

    total = LIST_CAP + 50
    gone = [{**_v("M-OLD-1"), "file": f"f{i}.py", "snippet": f"old {i}"} for i in range(total)]
    fresh = [{**_v("M-REU-1"), "file": f"f{i}.py", "snippet": f"new {i}",
              "severity": "major" if i % 2 else "minor"} for i in range(total)]
    _run(tmp_path, "r-old", "2026-09-10T00:00:00Z", "done", {_DIM: gone})
    _run(tmp_path, "r-curr", "2026-09-26T00:00:00Z", "done", {_DIM: fresh})

    out = diff_runs(tmp_path, _PROJECT, "r-curr", None)

    counts = out["dimensions"][_DIM]["counts"]
    assert counts["new"] == total and sum(counts["newSev"].values()) == total
    assert counts["newSev"] == {"major": total // 2, "minor": total // 2}
    summary = summarise_diff(out)
    assert sum(summary["newSev"].values()) == summary["counts"]["new"] == total
    assert summary["resolvedSev"] == {"minor": total} and summary["counts"]["resolved"] == total
