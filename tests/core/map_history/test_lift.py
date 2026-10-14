from quodeq.core.map_history.area_metrics import AreaKind, AreaMetrics
from quodeq.core.map_history.areas import AreaAssignment
from quodeq.core.map_history.lift import selection_density, with_lift
from quodeq.core.map_history.snapshot import FileStat, RunSnapshot


def _metrics(area: str, density: float) -> AreaMetrics:
    return AreaMetrics(area=area, files=3, prod_files=3, violations=0, weight=0.0, density=density, compliance_rate=0.0,
                       touched_share=0.0, change_rate=0.0, persistent_share=0.0, has_history=False, need_pct=0.0,
                       kind=AreaKind.HEALTHY, raw_kind=AreaKind.HEALTHY)


def test_selection_density_is_weight_over_production_files():
    snap = RunSnapshot(("sec",), {"a.py": FileStat(weight=4.0), "b.py": FileStat(), "tests/t.py": FileStat(weight=9.0)})
    assign = {"a.py": AreaAssignment("x", "shared", False), "b.py": AreaAssignment("x", "shared", False),
              "tests/t.py": AreaAssignment("x", "shared", True)}
    assert selection_density(snap, assign) == 2.0


def test_selection_density_of_tests_only_counts_them():
    snap = RunSnapshot(("sec",), {"tests/t.py": FileStat(weight=1.0)})
    assert selection_density(snap, {"tests/t.py": AreaAssignment("x", "shared", True)}) == 1.0


def test_lift_is_density_over_the_selection_density():
    lifted = with_lift([_metrics("a", 1.5), _metrics("b", 0.0), _metrics("c", 0.5)], 0.75)
    assert [m.lift for m in lifted] == [2.0, 0.0, 0.667]


def test_lift_without_any_weight_is_zero():
    assert with_lift([_metrics("a", 0.0)], 0.0)[0].lift == 0.0


def test_lift_is_unset_without_a_selection():
    assert _metrics("a", 1.0).lift is None
