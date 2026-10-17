"""The map history's JSON shape: camelCase keys, one positional row per file.

``frames=all`` is sent as delta frames: the first frame lists every file row,
each later one only the rows that changed since the frame before, plus
``gone`` (the files that left). ``frames=latest`` is one full frame.
"""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from quodeq.core.map_history.area_metrics import AreaMetrics
from quodeq.core.map_history.history import FileRow, MapFrame, MapHistory

FRAME_ENCODING_FULL = "full"
FRAME_ENCODING_DELTA = "delta"


def _flag(value: bool) -> int:
    """A boolean as the 0/1 the UI reads."""
    return 1 if value else 0


def _file_row(row: FileRow) -> list[Any]:
    """``[file, weight, violations, compliance, critical, major, edits, ageFrom]``."""
    return [row.file, row.weight, row.violations, row.compliance, row.critical, row.major, row.edits, row.age_from]


def _area(m: AreaMetrics) -> dict[str, Any]:
    """One area's metrics with the UI's keys; ``lift`` only under a finding selection."""
    out = {"area": m.area, "files": m.files, "prodFiles": m.prod_files, "violations": m.violations,
           "weight": m.weight, "density": m.density, "complianceRate": m.compliance_rate,
           "touchedShare": m.touched_share, "changeRate": m.change_rate,
           "persistentShare": m.persistent_share, "needPct": m.need_pct, "kind": str(m.kind),
           "rawKind": str(m.raw_kind), "hasHistory": m.has_history}
    if m.lift is not None:
        out["lift"] = m.lift
    return out


def _frame_head(frame: MapFrame) -> dict[str, Any]:
    """One run's day, flows and area metrics."""
    return {"day": frame.day, "new": frame.new, "fixed": frame.fixed, "areas": [_area(m) for m in frame.areas]}


def _full_frames(frames: Iterable[MapFrame]) -> list[dict[str, Any]]:
    """Every frame with every file row."""
    return [{**_frame_head(f), "files": [_file_row(r) for r in f.files]} for f in frames]


def _delta_frames(frames: Iterable[MapFrame]) -> list[dict[str, Any]]:
    """Every frame with only the rows that changed since the frame before, and the files that left."""
    out: list[dict[str, Any]] = []
    before: dict[int, list[Any]] = {}
    for frame in frames:
        rows = {r.file: _file_row(r) for r in frame.files}
        changed = [row for f, row in rows.items() if before.get(f) != row]
        out.append({**_frame_head(frame), "files": changed, "gone": sorted(before.keys() - rows.keys())})
        before = rows
    return out


def map_history_payload(history: MapHistory, *, delta: bool = False) -> dict[str, Any]:
    """The JSON body of ``GET /api/projects/<project>/map/history`` (delta frames when *delta*)."""
    return {"activitySource": history.activity_source, "days": list(history.days), "dayRuns": list(history.day_runs),
            "fileNames": list(history.file_names), "fileArea": list(history.file_area),
            "fileTest": [_flag(t) for t in history.file_test], "fileLayer": list(history.file_layer),
            "frameEncoding": FRAME_ENCODING_DELTA if delta else FRAME_ENCODING_FULL,
            "frames": _delta_frames(history.frames) if delta else _full_frames(history.frames)}
