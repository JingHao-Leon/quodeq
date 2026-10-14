"""Lift: an area's density against its finding selection's density over the whole project.

Under a selection (some dimensions, or one principle) the zones stay on the
absolute density lines; lift only says how much denser an area is than the
selection is across the project, for ordering and emphasis, never for zones.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace

from quodeq.core.map_history.area_metrics import RATIO_DECIMALS, AreaMetrics
from quodeq.core.map_history.areas import AreaAssignment
from quodeq.core.map_history.snapshot import RunSnapshot


def selection_density(snap: RunSnapshot, assignments: Mapping[str, AreaAssignment]) -> float:
    """Weighted issues per production file over every assigned file of *snap* (all of them when none is production).

    *snap* holds only the selection's files, so these are the production files
    its findings and checks touch; the same production rule as an area's density.
    """
    paths = [p for p in snap.files if p in assignments]
    prod = [p for p in paths if not assignments[p].is_test] or paths
    return sum(snap.files[p].weight for p in prod) / max(1, len(prod))


def _lift(area_density: float, density: float) -> float:
    """*area_density* over *density*, kept to ``RATIO_DECIMALS``; 0 when the selection has no weight at all."""
    return round(area_density / density, RATIO_DECIMALS) if density > 0 else 0.0


def with_lift(run: list[AreaMetrics], density: float) -> list[AreaMetrics]:
    """One run's area metrics, each with its lift over the selection's project-wide *density*."""
    return [replace(m, lift=_lift(m.density, density)) for m in run]
