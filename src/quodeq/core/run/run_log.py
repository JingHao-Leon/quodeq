"""History's comparison rules: which earlier run each run is read against."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any

BASELINE_SAME_MODEL = "same-model"
BASELINE_OTHER_MODEL = "other-model"

# Keys of the diff payload's per-dimension "counts" block; the same names are
# the keys of the summary's "counts", so they are shared in one tuple.
_COUNT_KEYS = ("new", "resolved", "notReevaluated")
# Severity assumed for a finding that carries none.
_DEFAULT_SEVERITY = "minor"


@dataclass(frozen=True)
class LogRun:
    """One scored run as the baseline choice sees it."""

    run_id: str
    started_at: str
    model: str | None
    dims: tuple[str, ...]


def _ordered(runs: list[LogRun]) -> list[LogRun]:
    """Newest first, ties broken by run id so a baseline never flips."""
    return sorted(runs, key=lambda r: (r.started_at, r.run_id), reverse=True)


def choose_baselines(runs: list[LogRun]) -> dict[str, tuple[str, str] | None]:
    """Each run's baseline: the newest older run with the same dimensions and
    model (an unknown model matches nothing), else the newest older run with the
    same dimensions, else none."""
    ordered = _ordered(runs)
    out: dict[str, tuple[str, str] | None] = {}
    for i, run in enumerate(ordered):
        older = [o for o in ordered[i + 1:] if o.dims == run.dims]
        same = next((o for o in older if run.model is not None and o.model == run.model), None)
        if same is not None:
            out[run.run_id] = (same.run_id, BASELINE_SAME_MODEL)
        elif older:
            out[run.run_id] = (older[0].run_id, BASELINE_OTHER_MODEL)
        else:
            out[run.run_id] = None
    return out


def _severities(findings: list[dict[str, Any]]) -> dict[str, int]:
    return dict(Counter(str(f.get("severity") or _DEFAULT_SEVERITY) for f in findings))


def summarise_diff(payload: dict[str, Any]) -> dict[str, Any]:
    """Counts and severity splits of a run diff payload, over all dimensions."""
    counts = dict.fromkeys(_COUNT_KEYS, 0)
    new: list[dict[str, Any]] = []
    resolved: list[dict[str, Any]] = []
    for entry in (payload.get("dimensions") or {}).values():
        c = entry.get("counts") or {}
        for k in counts:
            counts[k] += int(c.get(k) or 0)
        new.extend(entry.get("new") or [])
        resolved.extend(entry.get("resolved") or [])
    return {"counts": counts, "newSev": _severities(new), "resolvedSev": _severities(resolved)}


def summarise_progress(progress: dict[str, Any]) -> dict[str, int]:
    """Files analysed (not cached) and active seconds over a run's dimensions."""
    dims = progress.get("dimensions") or []
    files = sum(int((d.get("files") or {}).get("taken") or 0) for d in dims)
    seconds = sum(float(d.get("elapsedS") or 0) for d in dims)
    return {"filesAnalysed": files, "activeSeconds": int(seconds)}
