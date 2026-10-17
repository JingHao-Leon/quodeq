"""External-run PID resolution, cancel without a pid file, and path-segment validation."""
from __future__ import annotations

import os

from quodeq.services._external_jobs import is_safe_run_segment, resolve_external_pid


# ---------------------------------------------------------------------------
# PID resolution
# ---------------------------------------------------------------------------

def test_resolve_external_pid_returns_none_without_pid_file(tmp_path):
    from quodeq.services._external_jobs import resolve_external_pid

    (tmp_path / "proj" / "run").mkdir(parents=True)
    assert resolve_external_pid(tmp_path / "proj", "run") is None


def test_resolve_external_pid_returns_pid_when_alive(tmp_path):
    from quodeq.services._external_jobs import resolve_external_pid

    run_dir = tmp_path / "proj" / "run"
    run_dir.mkdir(parents=True)
    (run_dir / ".pid").write_text(str(os.getpid()))
    assert resolve_external_pid(tmp_path / "proj", "run") == os.getpid()


def test_resolve_external_pid_returns_none_when_process_dead(tmp_path):
    from quodeq.services._external_jobs import resolve_external_pid

    run_dir = tmp_path / "proj" / "run"
    run_dir.mkdir(parents=True)
    # Use a very high PID that's almost certainly not in use
    (run_dir / ".pid").write_text("999999")
    assert resolve_external_pid(tmp_path / "proj", "run") is None


def test_resolve_external_pid_returns_none_for_corrupt_pid_file(tmp_path):
    from quodeq.services._external_jobs import resolve_external_pid

    run_dir = tmp_path / "proj" / "run"
    run_dir.mkdir(parents=True)
    (run_dir / ".pid").write_text("not-a-number")
    assert resolve_external_pid(tmp_path / "proj", "run") is None


# ---------------------------------------------------------------------------
# cancel_external_run
# ---------------------------------------------------------------------------

def test_cancel_external_run_returns_false_without_pid_file(tmp_path):
    from quodeq.services._external_jobs import cancel_external_run

    (tmp_path / "proj" / "run").mkdir(parents=True)
    assert cancel_external_run("proj", "run", tmp_path) is False


# ---------------------------------------------------------------------------
# Path-segment validation for externally-supplied run/project ids
# ---------------------------------------------------------------------------


class TestIsSafeRunSegment:
    def test_accepts_uuid(self):
        assert is_safe_run_segment("d5b8a421-8c9f-4e11-9b7a-1f2e3d4c5b6a")

    def test_accepts_dotted_and_underscored_names(self):
        assert is_safe_run_segment("run_1.backup-2")

    def test_rejects_dot_and_dotdot(self):
        assert not is_safe_run_segment(".")
        assert not is_safe_run_segment("..")

    def test_rejects_empty(self):
        assert not is_safe_run_segment("")

    def test_rejects_separators(self):
        assert not is_safe_run_segment("a/b")
        assert not is_safe_run_segment("a\\b")
        assert not is_safe_run_segment("../etc")

    def test_rejects_other_charset(self):
        assert not is_safe_run_segment("run id")
        assert not is_safe_run_segment("run\x00id")


class TestResolveExternalPidValidation:
    def test_traversal_run_id_returns_none(self, tmp_path):
        # A '..' run_id would otherwise resolve to reports_root/<proj>/../.pid
        (tmp_path / ".pid").write_text("12345")
        assert resolve_external_pid(tmp_path / "proj", "..") is None

    def test_traversal_project_uuid_returns_none(self, tmp_path):
        assert resolve_external_pid(tmp_path / "..", "run") is None


class TestCancelExternalValidation:
    def test_cancel_job_rejects_traversal_ext_id(self, tmp_path):
        from quodeq.services.jobs import JobManager

        (tmp_path / ".pid").write_text("12345")
        assert JobManager().cancel_job("ext-..", reports_root=tmp_path) is False


def test_a_reused_pid_is_not_the_run_and_is_never_cancelled(tmp_path) -> None:
    """A finished run keeps its .pid; once the OS hands that number to another
    program, the run must read as gone, or cancelling it signals a stranger."""
    import subprocess  # noqa: PLC0415
    import sys  # noqa: PLC0415
    import time  # noqa: PLC0415

    import pytest  # noqa: PLC0415

    if sys.platform == "win32":
        pytest.skip("start time comes from ps; Windows keeps liveness-only")

    run_dir = tmp_path / "run-1"
    run_dir.mkdir()
    stranger = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        pid_file = run_dir / ".pid"
        pid_file.write_text(str(stranger.pid), encoding="utf-8")
        an_hour_ago = time.time() - 3600
        os.utime(pid_file, (an_hour_ago, an_hour_ago))  # written by the run, long before

        assert resolve_external_pid(tmp_path, "run-1") is None
    finally:
        stranger.kill()
        stranger.wait(timeout=5)
