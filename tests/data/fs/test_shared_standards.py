import json
import subprocess

import pytest

from quodeq.data.fs.shared_standards import read_shared_standards, stage_standard_paths, write_shared_standard


def test_round_trip_and_folder_creation(tmp_path):
    folder = tmp_path / "standards"
    write_shared_standard(folder, "android", {"id": "android", "name": "Android"})
    assert read_shared_standards(folder) == {"android": {"id": "android", "name": "Android"}}


def test_missing_folder_reads_empty(tmp_path):
    assert read_shared_standards(tmp_path / "nope") == {}


def test_bad_files_are_skipped(tmp_path, caplog):
    folder = tmp_path / "standards"
    folder.mkdir()
    (folder / "broken.json").write_text("{not json", encoding="utf-8")
    (folder / "list.json").write_text("[1]", encoding="utf-8")
    (folder / "mismatch.json").write_text(json.dumps({"id": "other"}), encoding="utf-8")
    write_shared_standard(folder, "ok", {"id": "ok"})
    assert list(read_shared_standards(folder)) == ["ok"]
    assert "broken.json" in caplog.text


@pytest.mark.parametrize("bad", ["../x", "a/b", "", "."])
def test_write_refuses_unsafe_ids(tmp_path, bad):
    with pytest.raises(ValueError):
        write_shared_standard(tmp_path / "standards", bad, {"id": bad})


def test_a_listing_failure_reads_empty(tmp_path, monkeypatch, caplog):
    folder = tmp_path / "standards"
    write_shared_standard(folder, "ok", {"id": "ok"})

    def _boom(self, pattern):
        raise PermissionError("denied")

    monkeypatch.setattr(type(folder), "glob", _boom)
    assert read_shared_standards(folder) == {}
    assert "denied" in caplog.text


def test_staging_treats_an_id_as_a_literal_path_not_a_glob(tmp_path):
    repo = tmp_path / "repo"
    subprocess.run(["git", "init", str(repo)], check=True, capture_output=True)
    (repo / "quodeq.json").write_text("{}", encoding="utf-8")
    (repo / ".gitignore").write_text("", encoding="utf-8")
    write_shared_standard(repo / "standards", "ab", {"id": "ab"})
    stage_standard_paths(repo, ["a*"])
    staged = subprocess.run(["git", "diff", "--cached", "--name-only"], cwd=repo,
                            check=True, capture_output=True, text=True).stdout.split()
    assert "standards/ab.json" not in staged
