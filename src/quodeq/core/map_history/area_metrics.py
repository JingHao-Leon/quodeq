"""Per-run area metrics and kinds: hotspot (bad and busy), dormant (bad and untouched)."""
from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import NamedTuple

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
WEIGHT_DECIMALS = 2         # decimal places kept of a severity weight
RATIO_DECIMALS = 3          # decimal places kept of a density, share, rate or rank


class AreaKind(StrEnum):
    """What an area's density and activity say about it in one run."""

    HOTSPOT = "hotspot"   # bad and busy
    DORMANT = "dormant"   # bad and untouched
    WATCH = "watch"       # denser than most, no clear activity pattern
    HEALTHY = "healthy"   # less dense than most
    SMALL = "small"       # too few production files to judge


class PathActivity(NamedTuple):
    """Per path in one run: its edits so far and the age in days of its oldest violation."""

    edits: dict[str, int]
    ages: dict[str, int]


@dataclass(frozen=True)
class AreaStats:
    """One area in one run, measured: size, finding density and activity."""

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
    has_history: bool


@dataclass(frozen=True)
class AreaMetrics(AreaStats):
    """An area's stats plus its density rank and (hysteresis-smoothed) kind."""

    need_pct: float
    kind: AreaKind
    raw_kind: AreaKind


def _midrank(values: list[float], v: float) -> float:
    """Share of the sorted *values* below *v*, plus half the ties."""
    below = bisect_left(values, v)
    ties = bisect_right(values, v) - below
    return (below + 0.5 * ties) / max(1, len(values))


def _need(values: list[float], v: float) -> float:
    """Density rank; a clean area (density 0) never ranks above 0, however many others are clean."""
    return 0.0 if v <= 0 else _midrank(values, v)


def _by_density(need: float) -> AreaKind:
    """The kind density alone gives: healthy below the watch rank, else watch."""
    return AreaKind.HEALTHY if need < HEALTHY_NEED_PCT else AreaKind.WATCH


def _is_hotspot(stats: AreaStats, need: float, activity: float) -> bool:
    """Dense, among the most changed, actually changing and above the hotspot floor."""
    return (need >= HOT_NEED_PCT and activity >= HOT_ACT_PCT and stats.change_rate > 0
            and stats.density >= FLOOR_HOTSPOT)


def _is_dormant(stats: AreaStats, need: float) -> bool:
    """Dense, barely touched and above the dormant floor."""
    return need >= DORMANT_NEED_PCT and stats.touched_share <= DORMANT_MAX_TOUCHED and stats.density >= FLOOR_DORMANT


def _classify(stats: AreaStats, need: float, rates: list[float]) -> AreaKind:
    """The raw (unsmoothed) kind of one area, given its density rank *need* and the run's sorted change rates."""
    if stats.prod_files < MIN_PROD_FILES:
        return AreaKind.SMALL
    if not stats.has_history:
        return _by_density(need)
    if _is_hotspot(stats, need, _midrank(rates, stats.change_rate)):
        return AreaKind.HOTSPOT
    if _is_dormant(stats, need):
        return AreaKind.DORMANT
    return _by_density(need)


def _ratio(part: float, whole: int) -> float:
    """*part* over *whole* (at least 1), kept to ``RATIO_DECIMALS``."""
    return round(part / max(1, whole), RATIO_DECIMALS)


def _area_stats(k: int, area: str, paths: list[str], snap: RunSnapshot, assignments: dict[str, AreaAssignment],
                activity: PathActivity) -> AreaStats:
    """One area's stats in run *k*, given its paths' *activity*."""
    edits, ages = activity.edits, activity.ages
    prod = [p for p in paths if not assignments[p].is_test] or paths
    viol = sum(snap.files[p].violations for p in prod)
    comp = sum(snap.files[p].compliance for p in prod)
    weight = sum(snap.files[p].weight for p in prod)
    old = sum(snap.files[p].violations for p in prod if ages.get(p, 0) >= OLD_ISSUE_DAYS)
    return AreaStats(
        area=area, files=len(paths), prod_files=len(prod), violations=viol, weight=round(weight, WEIGHT_DECIMALS),
        density=_ratio(weight, len(prod)), compliance_rate=_ratio(comp, comp + viol),
        touched_share=_ratio(sum(1 for p in paths if edits.get(p)), len(paths)),
        change_rate=_ratio(sum(edits.get(p, 0) for p in paths), len(paths) * max(1, k)),
        persistent_share=_ratio(old, viol), has_history=k >= MIN_HISTORY_RUNS)


def _run_stats(k: int, snap: RunSnapshot, assignments: dict[str, AreaAssignment],
               activity: PathActivity) -> list[AreaStats]:
    """Every area's stats in run *k*, areas in first-seen path order; unassigned paths are left out."""
    by: dict[str, list[str]] = defaultdict(list)
    for path in snap.files:
        if path in assignments:
            by[assignments[path].area].append(path)
    return [_area_stats(k, area, paths, snap, assignments, activity) for area, paths in by.items()]


@dataclass
class _Hysteresis:
    """Per-area kind smoothing across runs: a change needs two runs in a row."""

    settled: dict[str, AreaKind] = field(default_factory=dict)
    pending: dict[str, AreaKind] = field(default_factory=dict)

    def smooth(self, area: str, raw: AreaKind) -> AreaKind:
        """The kind *area* shows this run, given its *raw* kind."""
        if area not in self.settled or raw == self.settled[area] or self.pending.get(area) == raw:
            self.settled[area] = raw
            self.pending.pop(area, None)
        else:
            self.pending[area] = raw
        return self.settled[area]


def area_metrics_per_run(snapshots: list[RunSnapshot], assignments: dict[str, AreaAssignment],
                         activity: list[PathActivity]) -> list[list[AreaMetrics]]:
    """Every run's area metrics from its snapshot and *activity* (one record per run); kinds use hysteresis."""
    result: list[list[AreaMetrics]] = []
    smoothing = _Hysteresis()
    for k, snap in enumerate(snapshots):
        stats = _run_stats(k, snap, assignments, activity[k])
        judged = [s for s in stats if s.prod_files >= MIN_PROD_FILES]
        dens = sorted(s.density for s in judged)
        rates = sorted(s.change_rate for s in judged)
        run: list[AreaMetrics] = []
        for s in stats:
            need = _need(dens, s.density)
            raw = _classify(s, need, rates)
            run.append(AreaMetrics(**asdict(s), need_pct=round(need, RATIO_DECIMALS), kind=smoothing.smooth(s.area, raw),
                                   raw_kind=raw))
        result.append(run)
    return result
