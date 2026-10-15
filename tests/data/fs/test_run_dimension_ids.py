"""Which dimensions a run analysed, from directory listings alone."""
from __future__ import annotations

from quodeq.data.fs.run_dirs import run_dimension_ids


def test_finished_and_in_progress_dimensions_are_both_listed(tmp_path):
    run = tmp_path / "run-1"
    (run / "evaluation").mkdir(parents=True)
    (run / "evaluation" / "Security.json").write_text("{}", encoding="utf-8")
    (run / "evidence").mkdir()
    (run / "evidence" / "quality_evidence.jsonl").write_text("", encoding="utf-8")
    assert run_dimension_ids(run) == frozenset({"security", "quality"})


def test_other_run_files_are_ignored(tmp_path):
    run = tmp_path / "run-1"
    (run / "evidence").mkdir(parents=True)
    for name in ("security_queue.json", "security.lock", "dispatch_keys.json", "security_stream.jsonl"):
        (run / "evidence" / name).write_text("", encoding="utf-8")
    (run / "evaluation").mkdir()
    (run / "evaluation" / "notes.txt").write_text("", encoding="utf-8")
    assert run_dimension_ids(run) == frozenset()


def test_a_run_without_folders_has_no_dimensions(tmp_path):
    assert run_dimension_ids(tmp_path / "missing") == frozenset()
