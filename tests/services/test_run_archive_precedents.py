"""An archived run's dismissals still reach precedent matching, from ``precedents.json``, without a restore."""
from __future__ import annotations

import json
import sqlite3
import tarfile
from pathlib import Path

import pytest

from quodeq.context.precedent import collect_dismissed_texts, load_precedent_fingerprints
from quodeq.data.fs import run_archive
from quodeq.data.fs.run_archive import ARCHIVE_FILENAME, RunArchiveError, archive_run, ensure_restored, is_archived
from quodeq.data.sqlite.findings_queries import dismissed_source_stamp, read_dismissed_snippets_strict
from quodeq.services.storage_cleanup import run_cleanup
from tests.services._archive_fixtures import NOW, make_run

_SNIPPET = "digest = hashlib.md5(payload)"


def _dismiss_one(run: Path) -> None:
    conn = sqlite3.connect(run / "evaluation.db")
    conn.execute("UPDATE findings SET verdict = 'dismissed', snippet = ?, scope = '' WHERE id = "
                 "(SELECT MIN(id) FROM findings)", (_SNIPPET,))
    conn.commit()
    conn.close()


def _fingerprints(project_dir: Path) -> set[str]:
    return load_precedent_fingerprints(project_dir, read_dismissed=read_dismissed_snippets_strict,
                                       source_stamp=dismissed_source_stamp, cache=_Memo())


class _Memo(dict):
    def put(self, key, value):
        self[key] = value


def _archived_with_a_dismissal(tmp_path: Path) -> tuple[Path, set[str], dict[str, str]]:
    run = make_run(tmp_path, "run-old")
    _dismiss_one(run)
    live = (_fingerprints(run.parent), collect_dismissed_texts(run.parent))
    assert live[0] and live[1]
    archive_run(run)
    return run, *live


def test_an_archived_run_keeps_its_precedents_without_a_restore(tmp_path):
    run, fingerprints, texts = _archived_with_a_dismissal(tmp_path)

    assert _fingerprints(run.parent) == fingerprints
    assert collect_dismissed_texts(run.parent) == texts
    assert is_archived(run) and not (run / "events.jsonl").exists() and not (run / "evaluation.db").exists()


def test_the_sidecar_is_kept_beside_the_archive_and_never_packed(tmp_path):
    run, _, _ = _archived_with_a_dismissal(tmp_path)
    with tarfile.open(run / ARCHIVE_FILENAME) as tar:
        assert "precedents.json" not in tar.getnames()

    ensure_restored(run)

    assert (run / "precedents.json").is_file() and not is_archived(run)


def test_restoring_reads_the_database_again(tmp_path):
    run, fingerprints, texts = _archived_with_a_dismissal(tmp_path)
    archived_stamp = dismissed_source_stamp(run)
    ensure_restored(run)

    assert dismissed_source_stamp(run) != archived_stamp  # memos refresh
    assert _fingerprints(run.parent) == fingerprints
    assert collect_dismissed_texts(run.parent) == texts


def test_an_aborted_archive_leaves_no_sidecar(tmp_path, monkeypatch):
    run = make_run(tmp_path, "run-old")
    _dismiss_one(run)
    real = run_archive._write_archive

    def write_then_add(tmp, sources):
        real(tmp, sources)
        (run / "evidence").mkdir(exist_ok=True)
        (run / "evidence" / "late_evidence.jsonl").write_text("{}\n")

    monkeypatch.setattr(run_archive, "_write_archive", write_then_add)
    with pytest.raises(RunArchiveError):
        archive_run(run)

    assert not is_archived(run) and not (run / "precedents.json").exists()


def test_a_database_from_before_the_scope_column_still_archives_its_dismissals(tmp_path):
    run = tmp_path / "proj" / "run-1"
    run.mkdir(parents=True)
    (run / "events.jsonl").write_text("{}\n")
    conn = sqlite3.connect(run / "evaluation.db")
    conn.execute("CREATE TABLE findings (id INTEGER PRIMARY KEY, requirement TEXT, snippet TEXT, verdict TEXT)")
    conn.execute("INSERT INTO findings (requirement, snippet, verdict) VALUES ('R1', ?, 'dismissed')", (_SNIPPET,))
    conn.commit()
    conn.close()

    archive_run(run)

    assert read_dismissed_snippets_strict(run) == [("R1", _SNIPPET)]
    assert collect_dismissed_texts(run.parent)


def test_cleanup_keeps_the_precedents_of_a_failed_run(tmp_path, monkeypatch):
    monkeypatch.setenv("QUODEQ_SCORE_CACHE_PATH", str(tmp_path / "cache.db"))
    old = make_run(tmp_path, "run-old", days=300)
    make_run(tmp_path, "run-new", days=10)
    (old / "status.json").write_text(json.dumps({"state": "failed", "started_at": "2026-01-01T00:00:00+00:00"}))
    _dismiss_one(old)

    run_cleanup(tmp_path, NOW, warm_days=183)

    assert is_archived(old)
    assert [snippet for _, snippet in read_dismissed_snippets_strict(old)] == [_SNIPPET]


def test_a_planted_tmp_symlink_is_never_followed(tmp_path):
    run = make_run(tmp_path, "run-old")
    _dismiss_one(run)
    outside = tmp_path / "outside.txt"
    outside.write_text("keep me")
    (run / "precedents.json.tmp").symlink_to(outside)

    archive_run(run)

    assert outside.read_text() == "keep me"
    assert (run / "precedents.json").is_file() and not (run / "precedents.json").is_symlink()
    assert [s for _, s in read_dismissed_snippets_strict(run)] == [_SNIPPET]


def test_a_symlinked_sidecar_reads_as_missing(tmp_path):
    run, _, _ = _archived_with_a_dismissal(tmp_path)
    real = tmp_path / "elsewhere.json"
    (run / "precedents.json").rename(real)
    (run / "precedents.json").symlink_to(real)

    assert read_dismissed_snippets_strict(run) == []


def test_sidecar_rows_with_non_string_values_are_skipped(tmp_path):
    run, _, _ = _archived_with_a_dismissal(tmp_path)
    (run / "precedents.json").write_text(json.dumps(
        {"version": 1, "dismissed": [["R1", 5], [{"x": 1}, "s"], ["R2", "ok"], [None, "n"]], "semantic": []}))

    assert read_dismissed_snippets_strict(run) == [("R2", "ok"), (None, "n")]
