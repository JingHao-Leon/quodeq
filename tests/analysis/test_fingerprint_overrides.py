"""Project threshold overrides fold into the standards fingerprint.

``hash_standards`` hashes the compiled standards JSON, which is shared
across projects and does NOT change when a project tunes a numeric
threshold in its machine settings file
(``~/.quodeq/projects/<owner>/standards.json``). Without folding the
overrides in, tuning ``max_lines`` 50 -> 60 and re-running reuses cached
findings classified under the 50-line rule with no drift signal.

The contract:

1. **Override change changes the fingerprint** — cached findings produced
   under the old threshold become detectable as drifted.
2. **Absent overrides leave the fingerprint byte-identical** to the
   pre-override-aware hash, so existing cache entries written before this
   feature (or by projects that never override) stay quiet — no phantom
   "standards changed" drift.
3. **Only the resolved content matters** — a formatting-only rewrite, a
   malformed file (which analysis ignores), or a visibility toggle that
   rewrites the same settings file must not shift the hash.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from quodeq.analysis import fingerprint
from quodeq.analysis.fingerprint import HashCache, hash_standards
from quodeq.data.fs.standards_prefs import ProjectStandards, write_project_standards

DIM = "maintainability"


def _write_compiled_standard(standards_dir: Path, dimension: str, body: str) -> None:
    compiled = standards_dir / "compiled"
    compiled.mkdir(parents=True, exist_ok=True)
    (compiled / f"{dimension}.json").write_text(body)


def _write_overrides(settings_file: Path, text: str) -> None:
    settings_file.parent.mkdir(parents=True, exist_ok=True)
    settings_file.write_text(text)


@pytest.fixture(autouse=True)
def _clear_fingerprint_caches(monkeypatch):
    # Fresh HashCache per test: isolation via injection (swapping the
    # module-default instance), not a cache_clear() attribute hook.
    monkeypatch.setattr(fingerprint, "_hash_cache", fingerprint.HashCache())


@pytest.fixture
def standards_dir(tmp_path: Path) -> Path:
    std = tmp_path / "standards"
    _write_compiled_standard(std, DIM, '{"rule": "v1"}')
    return std


@pytest.fixture
def settings_file(tmp_path: Path) -> Path:
    return tmp_path / "home" / "projects" / "p" / "standards.json"


def test_changing_override_value_changes_fingerprint(standards_dir, settings_file):
    _write_overrides(
        settings_file,
        '{"version": 1, "overrides": {"M-ANA-2": {"max_lines": 50}}}',
    )
    before = fingerprint.hash_standards(standards_dir, DIM, settings_file)

    _write_overrides(
        settings_file,
        '{"version": 1, "overrides": {"M-ANA-2": {"max_lines": 600}}}',
    )
    after = fingerprint.hash_standards(standards_dir, DIM, settings_file)

    assert before is not None and after is not None
    assert before != after


def test_overrides_presence_changes_fingerprint_vs_baseline(standards_dir, settings_file):
    baseline = fingerprint.hash_standards(standards_dir, DIM)
    _write_overrides(
        settings_file,
        '{"version": 1, "overrides": {"M-ANA-2": {"max_lines": 60}}}',
    )
    overridden = fingerprint.hash_standards(standards_dir, DIM, settings_file)

    assert baseline is not None and overridden is not None
    assert overridden != baseline


def test_absent_overrides_file_leaves_fingerprint_unchanged(standards_dir, settings_file):
    # Load-bearing backward compatibility: entries written before the
    # override-aware hash carry the plain compiled-JSON hash. A project
    # with no overrides file must keep producing that exact value.
    baseline = fingerprint.hash_standards(standards_dir, DIM)
    with_file = fingerprint.hash_standards(standards_dir, DIM, settings_file)
    assert with_file == baseline


def test_unchanged_overrides_file_keeps_fingerprint_stable(standards_dir, settings_file):
    _write_overrides(
        settings_file,
        '{"version": 1, "overrides": {"M-ANA-2": {"max_lines": 60}}}',
    )
    first = fingerprint.hash_standards(standards_dir, DIM, settings_file)
    second = fingerprint.hash_standards(standards_dir, DIM, settings_file)
    assert first == second


def test_formatting_only_rewrite_keeps_fingerprint(standards_dir, settings_file):
    # The hash covers the resolved override mapping, not raw bytes —
    # re-saving the file with different whitespace/key order is not a
    # threshold change and must not flag drift.
    _write_overrides(
        settings_file,
        '{"version": 1, "overrides": {"M-ANA-2": {"max_lines": 60}}}',
    )
    before = fingerprint.hash_standards(standards_dir, DIM, settings_file)

    reordered = json.dumps(
        {"overrides": {"M-ANA-2": {"max_lines": 60}}, "version": 1}, indent=4,
    )
    _write_overrides(settings_file, reordered)
    after = fingerprint.hash_standards(standards_dir, DIM, settings_file)

    assert after == before


def test_malformed_overrides_treated_as_absent(standards_dir, settings_file):
    # Analysis ignores a malformed file (load_overrides_file -> {});
    # the fingerprint must agree with what analysis actually uses.
    baseline = fingerprint.hash_standards(standards_dir, DIM)
    _write_overrides(settings_file, "{not json")
    assert fingerprint.hash_standards(standards_dir, DIM, settings_file) == baseline


def test_missing_compiled_standard_still_none(tmp_path: Path, settings_file):
    _write_overrides(
        settings_file,
        '{"version": 1, "overrides": {"M-ANA-2": {"max_lines": 60}}}',
    )
    assert fingerprint.hash_standards(tmp_path / "nostd", DIM, settings_file) is None


def test_toggle_in_same_file_keeps_hash(standards_dir, settings_file):
    # A visibility toggle rewrites the settings file (new mtime, new bytes)
    # but leaves the overrides alone: the fingerprint must not move.
    # One cache across the toggle: the memo is keyed by the file's stat, so
    # the rewrite misses and recomputes, and the recomputed value must match.
    cache = HashCache()
    write_project_standards(settings_file, ProjectStandards(enabled=("security",), overrides={"R": {"n": 1}}))
    before = hash_standards(standards_dir, DIM, settings_file, cache=cache)
    write_project_standards(settings_file, ProjectStandards(enabled=("usability",), overrides={"R": {"n": 1}}))
    after = hash_standards(standards_dir, DIM, settings_file, cache=cache)
    assert before is not None and before != hash_standards(standards_dir, DIM)
    assert after == before


def test_override_edit_changes_hash(standards_dir, settings_file):
    write_project_standards(settings_file, ProjectStandards(overrides={"R": {"n": 1}}))
    before = hash_standards(standards_dir, DIM, settings_file, cache=HashCache())
    write_project_standards(settings_file, ProjectStandards(overrides={"R": {"n": 2}}))
    assert hash_standards(standards_dir, DIM, settings_file, cache=HashCache()) != before


def test_visibility_only_settings_file_keeps_plain_hash(standards_dir, settings_file):
    # A project that only chose standards (no overrides) keys like a
    # project with no settings at all.
    write_project_standards(settings_file, ProjectStandards(enabled=("security",)))
    assert hash_standards(standards_dir, DIM, settings_file) == hash_standards(standards_dir, DIM)
