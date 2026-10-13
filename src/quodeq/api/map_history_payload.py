"""The map history's JSON shape: camelCase keys, one positional row per file."""
from __future__ import annotations

from typing import Any

from quodeq.core.map_history.area_metrics import AreaMetrics
from quodeq.core.map_history.history import FileRow, MapFrame, MapHistory


def _flag(value: bool) -> int:
    """A boolean as the 0/1 the UI reads."""
    return 1 if value else 0


def _file_row(row: FileRow) -> list[Any]:
    """``[file, weight, violations, compliance, critical, major, edits, touched, ageDays]``."""
    return [row.file, row.weight, row.violations, row.compliance, row.critical, row.major,
            row.edits, _flag(row.touched), row.age_days]


def _area(m: AreaMetrics) -> dict[str, Any]:
    """One area's metrics with the UI's keys."""
    return {"area": m.area, "files": m.files, "prodFiles": m.prod_files, "violations": m.violations,
            "weight": m.weight, "density": m.density, "complianceRate": m.compliance_rate,
            "touchedShare": m.touched_share, "changeRate": m.change_rate,
            "persistentShare": m.persistent_share, "needPct": m.need_pct, "kind": str(m.kind),
            "rawKind": str(m.raw_kind), "hasHistory": m.has_history}


def _frame(frame: MapFrame) -> dict[str, Any]:
    """One run's frame."""
    return {"day": frame.day, "new": frame.new, "fixed": frame.fixed,
            "files": [_file_row(r) for r in frame.files], "areas": [_area(m) for m in frame.areas]}


def map_history_payload(history: MapHistory) -> dict[str, Any]:
    """The JSON body of ``GET /api/projects/<project>/map/history``."""
    return {"activitySource": history.activity_source, "days": list(history.days),
            "fileNames": list(history.file_names), "fileArea": list(history.file_area),
            "fileTest": [_flag(t) for t in history.file_test], "fileLayer": list(history.file_layer),
            "frames": [_frame(f) for f in history.frames]}
