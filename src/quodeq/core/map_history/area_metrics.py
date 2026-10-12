"""Per-run area metrics and kinds: hotspot (bad and busy), dormant (bad and untouched)."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from quodeq.core.map_history.areas import AreaAssignment
from quodeq.core.map_history.snapshot import RunSnapshot

MIN_PROD_FILES = 3          # smaller areas are "small": too few files to judge
MIN_HISTORY_RUNS = 3        # kinds that need activity wait for this many runs
HOT_NEED_PCT = 0.6
HOT_ACT_PCT = 0.6
DORMANT_NEED_PCT = 0.4
DORMANT_MAX_TOUCHED = 0.25
FLOOR_HOTSPOT = 0.75        # weighted findings per file
FLOOR_DORMANT = 0.5
HEALTHY_NEED_PCT = 0.4
OLD_ISSUE_DAYS = 42


@dataclass(frozen=True)
class AreaMetrics:
    """One area in one run: size, finding density, activity and its (hysteresis-smoothed) kind."""

    area: str
    files: int
    prod_files: int
    violations: int
    weight: float
    density: float
    compliance_rate: float
    touched_share: float
    change_rate: float
    persistent_share: float
    need_pct: float
    kind: str
    raw_kind: str
    has_history: bool


def _pct(values: list[float], v: float) -> float:
    return sum(1 for x in values if x <= v) / max(1, len(values))


def _classify(m: dict, dens: list[float], rates: list[float]) -> str:
    need = _pct(dens, m["density"])
    if m["prod_files"] < MIN_PROD_FILES:
        return "small"
    if not m["has_history"]:
        return "healthy" if need < HEALTHY_NEED_PCT else "watch"
    act = _pct(rates, m["change_rate"])
    if need >= HOT_NEED_PCT and act >= HOT_ACT_PCT and m["change_rate"] > 0 and m["density"] >= FLOOR_HOTSPOT:
        return "hotspot"
    if need >= DORMANT_NEED_PCT and m["touched_share"] <= DORMANT_MAX_TOUCHED and m["density"] >= FLOOR_DORMANT:
        return "dormant"
    return "healthy" if need < HEALTHY_NEED_PCT else "watch"


def _run_metrics(k: int, snap: RunSnapshot, assignments: dict[str, AreaAssignment],
                 edits: dict[str, int], ages: dict[str, int]) -> list[dict]:
    by: dict[str, list[str]] = defaultdict(list)
    for path in snap.files:
        if path in assignments:
            by[assignments[path].area].append(path)
    out = []
    for area, paths in by.items():
        prod = [p for p in paths if not assignments[p].is_test] or paths
        viol = sum(snap.files[p].violations for p in prod)
        comp = sum(snap.files[p].compliance for p in prod)
        weight = sum(snap.files[p].weight for p in prod)
        old = sum(snap.files[p].violations for p in prod if ages.get(p, 0) >= OLD_ISSUE_DAYS)
        out.append({
            "area": area, "files": len(paths), "prod_files": len(prod), "violations": viol, "weight": round(weight, 2),
            "density": round(weight / max(1, len(prod)), 3), "compliance_rate": round(comp / max(1, comp + viol), 3),
            "touched_share": round(sum(1 for p in paths if edits.get(p)) / len(paths), 3),
            "change_rate": round(sum(edits.get(p, 0) for p in paths) / max(1, len(paths) * max(1, k)), 3),
            "persistent_share": round(old / max(1, viol), 3), "has_history": k >= MIN_HISTORY_RUNS,
        })
    return out


def area_metrics_per_run(snapshots: list[RunSnapshot], assignments: dict[str, AreaAssignment],
                         edits: list[dict[str, int]], ages_days: list[dict[str, int]]) -> list[list[AreaMetrics]]:
    """Every run's area metrics; kinds use hysteresis (a change needs two runs in a row)."""
    result: list[list[AreaMetrics]] = []
    settled: dict[str, str] = {}
    pending: dict[str, str] = {}
    for k, snap in enumerate(snapshots):
        rows = _run_metrics(k, snap, assignments, edits[k], ages_days[k])
        judged = [r for r in rows if r["prod_files"] >= MIN_PROD_FILES]
        dens = sorted(r["density"] for r in judged)
        rates = sorted(r["change_rate"] for r in judged)
        run: list[AreaMetrics] = []
        for r in rows:
            raw = _classify(r, dens, rates)
            name = r["area"]
            if name not in settled or raw == settled[name] or pending.get(name) == raw:
                settled[name] = raw
                pending.pop(name, None)
            else:
                pending[name] = raw
            run.append(AreaMetrics(need_pct=round(_pct(dens, r["density"]), 3), kind=settled[name], raw_kind=raw, **r))
        result.append(run)
    return result
