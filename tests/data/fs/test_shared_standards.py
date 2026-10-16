import json
import subprocess

import pytest

from quodeq.data.fs.shared_standards import (
    commit_staged, read_shared_standards, restore_shared_standards, stage_standard_paths,
    write_shared_standard,
)


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


def _repo(tmp_path):
    repo = tmp_path / "repo"
    subprocess.run(["git", "init", "-q", str(repo)], check=True, capture_output=True)
    return repo


def _commit_all(repo):
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c"],
                   cwd=repo, check=True, capture_output=True)


def test_restore_without_a_clone_head_or_standards_folder_is_fine(tmp_path):
    assert restore_shared_standards(tmp_path / "missing")[0]
    repo = _repo(tmp_path)
    assert restore_shared_standards(repo)[0]  # empty repository, no HEAD
    (repo / "quodeq.json").write_text("{}", encoding="utf-8")
    _commit_all(repo)
    write_shared_standard(repo / "standards", "left", {"id": "left"})
    assert restore_shared_standards(repo)[0]  # HEAD without standards/
    assert not (repo / "standards" / "left.json").exists()


def test_restore_drops_untracked_and_restores_tracked_standards(tmp_path):
    repo = _repo(tmp_path)
    write_shared_standard(repo / "standards", "kept", {"id": "kept", "v": 1})
    _commit_all(repo)
    write_shared_standard(repo / "standards", "kept", {"id": "kept", "v": 2})
    write_shared_standard(repo / "standards", "left", {"id": "left"})
    (repo / "other.txt").write_text("untouched", encoding="utf-8")
    ok, _ = restore_shared_standards(repo)
    assert ok and read_shared_standards(repo / "standards") == {"kept": {"id": "kept", "v": 1}}
    assert (repo / "other.txt").exists()


def _log_count(repo):
    out = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=repo, capture_output=True, text=True)
    return int(out.stdout.strip() or 0)


def test_commit_staged_commits_only_when_something_is_staged(tmp_path, monkeypatch):
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t@t")
    repo = _repo(tmp_path)
    write_shared_standard(repo / "standards", "a", {"id": "a"})
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True, capture_output=True)
    assert commit_staged(repo, "first")[0] and _log_count(repo) == 1
    assert commit_staged(repo, "again") == (True, "") and _log_count(repo) == 1
