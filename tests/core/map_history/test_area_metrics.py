from quodeq.core.map_history.area_metrics import area_metrics_per_run
from quodeq.core.map_history.areas import AreaAssignment
from quodeq.core.map_history.snapshot import FileStat, RunSnapshot


def _snap(heavy: float):
    files = {f"hot/f{i}.py": FileStat(major=2, weight=heavy) for i in range(5)}
    files.update({f"calm/f{i}.py": FileStat(compliance=3) for i in range(5)})
    files.update({f"old/f{i}.py": FileStat(major=2, weight=heavy) for i in range(5)})
    return RunSnapshot(("sec",), files)


def _assign():
    return {p: AreaAssignment(p.split("/")[0], "shared", False) for p in _snap(4).files}


def test_single_run_has_no_history_and_uses_density_only():
    (run,) = area_metrics_per_run([_snap(4)], _assign(), [{}], [{}])
    kinds = {m.area: m for m in run}
    assert not kinds["hot"].has_history and kinds["calm"].kind == "healthy"


def test_hotspot_vs_dormant_after_history():
    snaps = [_snap(4)] * 5
    edits = [{f"hot/f{i}.py": k for i in range(5)} for k in range(5)]
    ages = [{} for _ in range(5)]
    last = {m.area: m for m in area_metrics_per_run(snaps, _assign(), edits, ages)[-1]}
    assert last["hot"].kind == "hotspot"
    assert last["old"].kind == "dormant"


def test_floor_keeps_a_clean_project_calm():
    snaps = [_snap(0.25)] * 5
    edits = [{f"hot/f{i}.py": k for i in range(5)} for k in range(5)]
    last = {m.area: m for m in area_metrics_per_run(snaps, _assign(), edits, [{}] * 5)[-1]}
    assert last["hot"].kind not in ("hotspot", "dormant")


def test_kind_changes_only_after_two_runs_agree():
    snaps = [_snap(4)] * 6
    edits = [{f"hot/f{i}.py": k for i in range(5)} for k in range(5)] + [{f"hot/f{i}.py": 4 for i in range(5)}]
    per_run = area_metrics_per_run(snaps, _assign(), edits, [{}] * 6)
    hot = [next(m for m in run if m.area == "hot") for run in per_run]
    assert hot[-1].kind == hot[-2].kind
