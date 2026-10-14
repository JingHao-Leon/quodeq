from dataclasses import replace

from quodeq.api.map_history_payload import map_history_payload
from quodeq.core.map_history.area_metrics import AreaKind, AreaMetrics
from quodeq.core.map_history.history import EMPTY_HISTORY, FileRow, MapFrame, MapHistory

AREA = AreaMetrics(area="x", files=1, prod_files=1, violations=1, weight=2.0, density=2.0, compliance_rate=0.0,
                   touched_share=1.0, change_rate=1.0, persistent_share=0.0, has_history=False, need_pct=0.0,
                   kind=AreaKind.SMALL, raw_kind=AreaKind.SMALL)


def _row(file: int, violations: int = 1, edits: int = 0) -> FileRow:
    return FileRow(file, 2.0, violations, 0, 0, 1, edits, 0)


def _wire(*rows: FileRow) -> list[list]:
    """*rows* as the payload sends them: one positional list per row."""
    return [list(r) for r in rows]


def _history(*frames: MapFrame) -> MapHistory:
    return MapHistory("git", tuple(f.day for f in frames), ("x/a.py", "x/b.py", "x/c.py"), ("x",) * 3, (False,) * 3, frames)


def test_empty_history_shape():
    assert map_history_payload(EMPTY_HISTORY) == {
        "activitySource": "none", "days": [], "dayRuns": [], "fileNames": [], "fileArea": [], "fileTest": [], "fileLayer": [],
        "frameEncoding": "full", "frames": []}


def test_rows_are_positional_and_end_with_age_from():
    frame = MapFrame("2026-09-01", 1, 0, (FileRow(0, 2.0, 1, 0, 0, 1, 3, 5),), (AREA,))
    body = map_history_payload(MapHistory("git", ("2026-09-01",), ("x/a.py",), ("x",), (True,), (frame,)))
    assert body["fileTest"] == [1]
    assert body["frames"][0]["files"] == [[0, 2.0, 1, 0, 0, 1, 3, 5]]
    assert body["frames"][0]["areas"][0]["kind"] == "small"


def test_delta_frames_send_only_changed_rows_and_the_files_that_left():
    one = MapFrame("2026-09-01", 0, 0, (_row(0), _row(1)), (AREA,))
    two = MapFrame("2026-09-08", 1, 0, (_row(0), _row(2)), (AREA,))
    three = MapFrame("2026-09-15", 0, 1, (_row(0, violations=0), _row(2)), (AREA,))
    body = map_history_payload(_history(one, two, three), delta=True)
    assert body["frameEncoding"] == "delta"
    assert [f["files"] for f in body["frames"]] == [_wire(_row(0), _row(1)), _wire(_row(2)), _wire(_row(0, violations=0))]
    assert [f["gone"] for f in body["frames"]] == [[], [1], []]


def test_file_layer_is_sent_parallel_to_file_names():
    history = MapHistory("git", ("2026-10-01",), ("a.kt", "b.py"), ("article", "api"), (False, False), (),
                         file_layer=("feature", ""))
    assert map_history_payload(history)["fileLayer"] == ["feature", ""]


def test_each_days_last_run_is_sent_parallel_to_days():
    history = MapHistory("git", ("2026-10-01", "2026-10-02"), (), (), (), (), day_runs=("r1", "r3"))
    body = map_history_payload(history)
    assert body["days"] == ["2026-10-01", "2026-10-02"]
    assert body["dayRuns"] == ["r1", "r3"]


def test_an_area_sends_its_lift_only_under_a_selection():
    plain = map_history_payload(_history(MapFrame("2026-09-01", 0, 0, (), (AREA,))))["frames"][0]["areas"][0]
    lifted = map_history_payload(_history(MapFrame("2026-09-01", 0, 0, (), (replace(AREA, lift=1.5),))))
    assert "lift" not in plain and lifted["frames"][0]["areas"][0]["lift"] == 1.5
