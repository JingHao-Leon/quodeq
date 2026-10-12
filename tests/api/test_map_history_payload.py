from quodeq.api.map_history_payload import map_history_payload
from quodeq.core.map_history.area_metrics import AreaKind, AreaMetrics
from quodeq.core.map_history.history import EMPTY_HISTORY, FileRow, MapFrame, MapHistory


def test_empty_history_shape():
    assert map_history_payload(EMPTY_HISTORY) == {
        "activitySource": "none", "days": [], "fileNames": [], "fileArea": [], "fileTest": [], "frames": []}


def test_rows_are_positional_and_flags_are_numbers():
    area = AreaMetrics(area="x", files=1, prod_files=1, violations=1, weight=2.0, density=2.0, compliance_rate=0.0,
                       touched_share=1.0, change_rate=1.0, persistent_share=0.0, has_history=False, need_pct=0.0,
                       kind=AreaKind.SMALL, raw_kind=AreaKind.SMALL)
    frame = MapFrame("2026-09-01", 1, 0, (FileRow(0, 2.0, 1, 0, 0, 1, 3, True, 5),), (area,))
    body = map_history_payload(MapHistory("git", ("2026-09-01",), ("x/a.py",), ("x",), (True,), (frame,)))
    assert body["fileTest"] == [1]
    assert body["frames"][0]["files"] == [[0, 2.0, 1, 0, 0, 1, 3, 1, 5]]
    assert body["frames"][0]["areas"][0]["kind"] == "small" and body["frames"][0]["areas"][0]["prodFiles"] == 1
