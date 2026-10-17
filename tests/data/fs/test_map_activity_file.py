import json

from quodeq.data.fs.map_activity_file import ACTIVITY_FILENAME, read_published_activity, write_published_activity


def test_round_trip(tmp_path):
    write_published_activity(tmp_path, {"version": 1, "days": {}})
    assert read_published_activity(tmp_path) == {"version": 1, "days": {}}


def test_missing_junk_and_symlinked_files_read_as_none(tmp_path):
    assert read_published_activity(tmp_path) is None
    (tmp_path / ACTIVITY_FILENAME).write_text("{not json")
    assert read_published_activity(tmp_path) is None
    target = tmp_path / "elsewhere.json"
    target.write_text(json.dumps({"version": 1, "days": {}}))
    (tmp_path / ACTIVITY_FILENAME).unlink()
    (tmp_path / ACTIVITY_FILENAME).symlink_to(target)
    assert read_published_activity(tmp_path) is None
