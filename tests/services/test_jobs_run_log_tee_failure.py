"""A run.log write failure must not end consumption of the job's output pipe.

The tee is a copy; the pipe read feeds the job's terminal and keeps the
child from blocking on a full pipe. When the copy fails (disk full, a
permission error) the consumer says so once, gives up the tee for that job
and keeps flushing every later batch to the job."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from quodeq.services.jobs import JobManager
from tests.services._jobs_run_log_fixtures import _make_job


def _manager_with_writer(tmp_path: Path, job_id: str, writer) -> tuple[JobManager, MagicMock]:
    log = MagicMock()
    jm = JobManager(reports_root=tmp_path, log=log)
    jm._store.put(_make_job(job_id))
    jm._run_log_writers[job_id] = writer
    return jm, log


def test_tee_write_error_does_not_stop_the_pipe_read(tmp_path: Path) -> None:
    writer = MagicMock()
    writer.write.side_effect = OSError("No space left on device")
    jm, log = _manager_with_writer(tmp_path, "job-tee", writer)

    jm._consume_stream("job-tee", iter(["one\n", "two\n", "three\n"]))

    assert list(jm._store.get("job-tee").logs) == ["one", "two", "three"]
    log.warning.assert_called_once()
    assert "job-tee" in log.warning.call_args[0][0]
    writer.write.assert_called_once_with("one")  # the tee is given up after the first failure
    writer.close.assert_called_once()  # the cleanup still releases the writer


def test_tee_keeps_writing_when_nothing_fails(tmp_path: Path) -> None:
    writer = MagicMock()
    jm, log = _manager_with_writer(tmp_path, "job-ok", writer)

    jm._consume_stream("job-ok", iter(["one\n", "two\n"]))

    assert [c.args[0] for c in writer.write.call_args_list] == ["one", "two"]
    log.warning.assert_not_called()
