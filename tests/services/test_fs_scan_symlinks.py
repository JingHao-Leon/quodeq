"""The project scan lists only the project's own files: symlinked directories are not followed."""
from __future__ import annotations

import sys

import pytest

from quodeq.services.fs_scan import scan_project


@pytest.mark.skipif(sys.platform == "win32", reason="creating symlinks needs privileges on Windows")
def test_scan_does_not_follow_symlinked_dirs(tmp_path):
    project = tmp_path / "project"
    outside = tmp_path / "outside"
    project.mkdir()
    outside.mkdir()
    (outside / "secret.txt").write_text("x")
    (project / "app.py").write_text("pass")
    (project / "link").symlink_to(outside, target_is_directory=True)
    assert scan_project(project).file_tree == ["app.py"]
