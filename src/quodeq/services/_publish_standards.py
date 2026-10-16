"""The custom standards a project publish carries into the shared repository.

A project's COMPLETED runs name the dimensions they scored; every custom
evaluator file among them is written to ``standards/<id>.json`` in the same
clone, so it rides in the project's commit. Built-in ids never travel, and
a shared copy that is newer than this machine's (``update_available`` or
``diverged``) is never overwritten: those ids come back as skipped, like a
shared copy that cannot be compared (a warning, never a failed publish). The
machine-local ``shared_hash`` is recorded only after the push succeeded.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.services._publish_staging import list_completed_runs
from quodeq.services.evidence_rescore import standard_dirs
from quodeq.services.standards_sharing import (
    SHARED_HASH_KEY, SyncState, now_utc_iso, share_hash, shareable_payload, sync_state,
)
from quodeq.services.standards_version import run_dimensions
from quodeq.services.wiring import (
    compiled_exists, read_standard_payload, resolve_jailed_standard_path, write_standard_payload,
)
from quodeq.services.wiring_sync import read_shared_standards, write_shared_standard

_STANDARDS_DIRNAME = "standards"
_PUBLISHED_AT = "publishedAt"
_NEWER_REMOTELY = frozenset({SyncState.UPDATE_AVAILABLE, SyncState.DIVERGED})
_MALFORMED = (TypeError, AttributeError, ValueError, KeyError)


@dataclass(frozen=True)
class StagedStandards:
    """What one project publish staged: the evaluators folder, published and skipped ids."""

    evaluators_dir: Path | None = None
    published: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


def _scored_ids(project_dir: Path) -> frozenset[str]:
    return frozenset().union(*(run_dimensions(run) for run in list_completed_runs(project_dir)))


def _read_local(evaluators_dir: Path, standard_id: str, log: LogSink) -> dict | None:
    """The evaluator file for *standard_id*, or None (with a warning) when unreadable."""
    try:
        data = read_standard_payload(resolve_jailed_standard_path(evaluators_dir, standard_id))
    except (OSError, ValueError, RecursionError) as exc:
        log.warning(f"Not publishing standard {standard_id}: its file cannot be read ({exc})")
        return None
    if data is not None and not isinstance(data, dict):
        log.warning(f"Not publishing standard {standard_id}: its file is not a JSON object")
        return None
    return data


def _candidates(evaluators_dir: Path, scored: frozenset[str], compiled_dir: Path | None,
                log: LogSink) -> list[str]:
    try:
        stems = sorted(p.stem for p in evaluators_dir.glob("*.json")) if evaluators_dir.is_dir() else []
    except OSError as exc:
        log.warning(f"Cannot list custom standards in {evaluators_dir}: {exc}")
        return []
    return [s for s in stems
            if s.lower() in scored and not (compiled_dir and compiled_exists(compiled_dir, s))]


def stage_project_standards(
    project_dir: Path, repo: Path, *, evaluators_dir: Path, now: Callable[[], str],
    compiled_dir: Path | None = None, log: LogSink = NULL_LOG,
) -> tuple[list[str], list[str]]:
    """Write each scored custom standard into ``<repo>/standards``; return ``(published, skipped)``.

    Already-identical copies are neither. Write failures raise ``OSError`` /
    ``ValueError`` for the caller to turn into a publish error.
    """
    scored = _scored_ids(project_dir)
    shared_dir = repo / _STANDARDS_DIRNAME
    remote = read_shared_standards(shared_dir)
    published: list[str] = []
    skipped: list[str] = []
    published_at = now()
    for standard_id in _candidates(evaluators_dir, scored, compiled_dir, log):
        local = _read_local(evaluators_dir, standard_id, log)
        if local is None:
            continue
        try:
            state = sync_state(local, remote.get(standard_id))
        except _MALFORMED as exc:
            log.warning(f"Not publishing standard {standard_id}: it cannot be compared with its shared copy ({exc})")
            state = SyncState.DIVERGED
        if state in _NEWER_REMOTELY:
            skipped.append(standard_id)
        elif state != SyncState.PUBLISHED:
            try:
                write_shared_standard(shared_dir, standard_id,
                                      {**shareable_payload(local), _PUBLISHED_AT: published_at})
            except ValueError as exc:
                log.warning(f"Not publishing standard {standard_id}: {exc}")
                skipped.append(standard_id)
                continue
            published.append(standard_id)
    return published, skipped


def stage_scored_standards(project_dir: Path, repo: Path, *, log: LogSink = NULL_LOG) -> StagedStandards:
    """``stage_project_standards`` with this install's standard folders and clock."""
    compiled_dir, evaluators_dir = standard_dirs()
    if evaluators_dir is None:
        return StagedStandards()
    published, skipped = stage_project_standards(
        project_dir, repo, evaluators_dir=evaluators_dir, now=now_utc_iso, compiled_dir=compiled_dir, log=log,
    )
    return StagedStandards(evaluators_dir, published, skipped)


def record_shared_hashes(repo: Path, staged: StagedStandards, *, log: LogSink = NULL_LOG) -> None:
    """After a successful push: record each published copy's hash on this machine's file.

    The hash is taken from the pushed copy and written onto the local file as
    it is now, so an edit made during the push reads as ``changed``. A write
    failure is logged, never raised: the push already happened.
    """
    if staged.evaluators_dir is None or not staged.published:
        return
    remote = read_shared_standards(repo / _STANDARDS_DIRNAME)
    for standard_id in staged.published:
        pushed, fresh = remote.get(standard_id), _read_local(staged.evaluators_dir, standard_id, log)
        if pushed is None or fresh is None:
            continue
        try:
            write_standard_payload(resolve_jailed_standard_path(staged.evaluators_dir, standard_id),
                                   {**fresh, SHARED_HASH_KEY: share_hash(pushed)})
        except (OSError, ValueError) as exc:
            log.warning(f"Published standard {standard_id} but could not record it locally: {exc}")
