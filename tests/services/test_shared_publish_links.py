"""A shared repository carrying committed links: publish refuses and writes nothing through them.

A hostile (or broken) teammate can commit a symbolic link where publish writes
a run file, a run subfolder or the project's actions log. Following it would
overwrite a file outside the clone (the owner's local event log, a dotfile).
Publish refuses before writing anything and names the linked path.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from quodeq.data.fs.shared_repo import shared_repo_path
from quodeq.services.shared_publish import PublishError, publish_project
from tests.services._archive_fixtures import PROJECT, make_run
from tests.services._shared_publish_git_fixtures import _bare_origin, _git_identity  # noqa: F401 -- fixture
from tests._timeouts import budget


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True, timeout=budget(30))


def _plant_link(tmp_path: Path, url: str, rel: str, target: Path) -> None:
    """Commit and push a symbolic link at *rel* pointing to *target*, from another clone."""
    other = tmp_path / "other"
    subprocess.run(["git", "clone", url, str(other)], check=True, capture_output=True, timeout=budget(30))
    link = other / rel
    if link.is_dir() and not link.is_symlink():
        subprocess.run(["rm", "-rf", str(link)], check=True)
    else:
        link.unlink(missing_ok=True)
    link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(target)
    _git(other, "add", "-A")
    _git(other, "commit", "-m", "plant link")
    _git(other, "push", "origin", "HEAD")


@pytest.fixture
def published(tmp_path):
    url, root = _bare_origin(tmp_path), tmp_path / "local"
    run = make_run(root, "run-a")
    (run / "evidence").mkdir(exist_ok=True)
    (run / "evidence" / "security_evidence.jsonl").write_text('{"snippet": "x"}\n')
    (root / PROJECT / "actions.jsonl").write_text('{"timestamp": "2026-01-01", "event_type": "x"}\n')
    publish_project(PROJECT, url, evaluations_root=root)
    return url, root


def _outside_file(tmp_path: Path) -> tuple[Path, bytes]:
    outside = tmp_path / "outside" / "precious.txt"
    outside.parent.mkdir()
    outside.write_bytes(b"do not touch\n")
    return outside, outside.read_bytes()


@pytest.mark.parametrize("rel", ["run-a/status.json", "run-a/events.jsonl", "actions.jsonl"])
def test_a_committed_file_link_refuses_the_publish_and_leaves_its_target_alone(tmp_path, published, rel):
    url, root = published
    outside, before = _outside_file(tmp_path)
    _plant_link(tmp_path, url, f"evaluations/{PROJECT}/{rel}", outside)
    with pytest.raises(PublishError, match=f"contains a link at evaluations/{PROJECT}/{rel}"):
        publish_project(PROJECT, url, evaluations_root=root)
    assert outside.read_bytes() == before
    assert (shared_repo_path(url) / "evaluations" / PROJECT / rel).is_symlink()


@pytest.mark.parametrize("folder", ["evidence", "evaluation"])
def test_a_committed_folder_link_refuses_the_publish_and_writes_nothing_into_its_target(tmp_path, published, folder):
    url, root = published
    outside = tmp_path / "outside-dir"
    outside.mkdir()
    _plant_link(tmp_path, url, f"evaluations/{PROJECT}/run-a/{folder}", outside)
    with pytest.raises(PublishError, match="Remove it from the repository and publish again"):
        publish_project(PROJECT, url, evaluations_root=root)
    assert list(outside.iterdir()) == []


def test_a_committed_standards_link_refuses_the_publish(tmp_path, published):
    url, root = published
    outside = tmp_path / "outside-dir"
    outside.mkdir()
    _plant_link(tmp_path, url, "standards", outside)
    with pytest.raises(PublishError, match="contains a link at standards"):
        publish_project(PROJECT, url, evaluations_root=root)
    assert list(outside.iterdir()) == []
