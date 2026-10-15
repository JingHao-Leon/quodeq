"""Share, install and update custom standards through the shared repository.

Runs synchronously under the clone lock: one small file per call. Git and
file mechanics come from data/ via the wiring modules; the rules come from
``standards_sharing``. ``run_git`` and ``PublishError`` are reached through
``services.shared_publish`` at call time, like ``_publish_git`` does, so the
tests that patch ``shared_publish.run_git`` intercept these calls too.
"""
from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from quodeq.services import shared_publish
from quodeq.services._publish_git import prepare_clone, push_with_rebase_fallback
from quodeq.services.import_validator import scan_injection, validate_import
from quodeq.services.standards_sharing import SHARED_HASH_KEY, share_hash, shareable_payload
from quodeq.services.wiring import (
    RepoFormat, bootstrap_repo_layout, clone_lock, read_standard_payload,
    resolve_jailed_standard_path, write_standard_payload,
)
from quodeq.services.wiring_sync import (
    read_shared_standards, shared_standards_dir, stage_standard_paths, write_shared_standard,
)

_PUBLISHED_AT = "publishedAt"
_REMOTE_DATED_KEYS = ("createdAt", "updatedAt", "version")
_INSTALLED_DEFAULTS = {"type": "custom", "managed": False, "origin": None, "origin_hash": None}


class ShareError(Exception):
    """A share/install/update the user can act on; *code* is the API error code.

    Codes: ``not_connected``, ``not_found``, ``builtin``, ``conflict``,
    ``unsafe``, ``invalid``, ``git``. The message is user-facing.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def now_utc_iso() -> str:
    """Now, as the ISO-8601 UTC timestamp a share records as ``publishedAt``."""
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _local_path(evaluators_dir: Path, standard_id: str) -> Path:
    try:
        return resolve_jailed_standard_path(evaluators_dir, standard_id)
    except ValueError as exc:
        raise ShareError("invalid", f"{standard_id!r} is not a valid standard id.") from exc


def _local(evaluators_dir: Path, standard_id: str) -> dict | None:
    try:
        return read_standard_payload(_local_path(evaluators_dir, standard_id))
    except ValueError as exc:
        raise ShareError("invalid", f"The standard file for {standard_id} is not valid JSON.") from exc


def _git_error(exc: Exception) -> ShareError:
    return ShareError("git", str(exc))


def _prepared(url: str, env: dict | None) -> Path:
    """The refreshed shared clone, laid out on first use. Call under ``clone_lock``."""
    try:
        repo, fmt = prepare_clone(url, env)
    except shared_publish.PublishError as exc:
        raise _git_error(exc) from exc
    if fmt == RepoFormat.EMPTY:
        try:
            bootstrap_repo_layout(repo)
        except (OSError, ValueError) as exc:
            raise ShareError("git", f"Could not lay out the shared repository: {exc}") from exc
    return repo


def _snippet(out: str) -> str:
    return out.strip()[:shared_publish.GIT_ERROR_SNIPPET_MAX_CHARS]


def _commit_and_push_standards(repo: Path, standard_ids: list[str], message: str,
                               env: dict | None) -> None:
    """Stage the standard files, commit them when anything changed, and push.

    Pushes even when nothing new was staged: an earlier call may have
    committed and then failed to push.
    """
    ok, out = stage_standard_paths(repo, standard_ids)
    if not ok:
        raise ShareError("git", f"git add failed: {_snippet(out)}")
    nothing_staged, _ = shared_publish.run_git(["diff", "--cached", "--quiet"], cwd=repo)
    if not nothing_staged:
        ok, out = shared_publish.run_git(["commit", "-m", message], cwd=repo)
        if not ok:
            raise ShareError("git", f"git commit failed: {_snippet(out)}")
    try:
        push_with_rebase_fallback(repo, env)
    except shared_publish.PublishError as exc:
        raise _git_error(exc) from exc


def share_standard(standard_id: str, *, url: str, evaluators_dir: Path,
                   now: Callable[[], str] = now_utc_iso, env: dict | None = None) -> dict:
    """Push this machine's copy of *standard_id* to ``standards/<id>.json`` (yours wins)."""
    local = _local(evaluators_dir, standard_id)
    if local is None:
        raise ShareError("not_found", f"No custom standard named {standard_id} on this machine.")
    published_at = now()
    with clone_lock(url, env):
        repo = _prepared(url, env)
        try:
            write_shared_standard(shared_standards_dir(url, env), standard_id,
                                  {**shareable_payload(local), _PUBLISHED_AT: published_at})
        except (OSError, ValueError) as exc:
            raise ShareError("invalid", f"Could not write {standard_id} into the shared repository.") from exc
        _commit_and_push_standards(repo, [standard_id], f"standards: publish {standard_id}", env)
    write_standard_payload(_local_path(evaluators_dir, standard_id),
                           {**local, SHARED_HASH_KEY: share_hash(local)})
    return {"id": standard_id, "publishedAt": published_at}


def _remote(url: str, env: dict | None, standard_id: str) -> dict:
    remote = read_shared_standards(shared_standards_dir(url, env)).get(standard_id)
    if remote is None:
        raise ShareError("not_found", f"{standard_id} is not in the shared repository.")
    return remote


def install_standard(standard_id: str, *, url: str, evaluators_dir: Path, env: dict | None = None) -> dict:
    """Copy ``standards/<id>.json`` from the clone into this machine's library (left off)."""
    local = _local(evaluators_dir, standard_id)
    remote = _remote(url, env, standard_id)
    theirs = share_hash(remote)
    if local is not None and local.get(SHARED_HASH_KEY) != theirs and share_hash(local) != theirs:
        raise ShareError("conflict", f"A different standard named {standard_id} already exists here. "
                                     "Duplicate it to keep both, then install again.")
    return _write_from_remote(standard_id, remote, evaluators_dir)


def update_from_shared(standard_id: str, *, url: str, evaluators_dir: Path, env: dict | None = None) -> dict:
    """Replace this machine's copy with the shared one (theirs wins)."""
    if _local(evaluators_dir, standard_id) is None:
        raise ShareError("not_found", f"No custom standard named {standard_id} on this machine.")
    return _write_from_remote(standard_id, _remote(url, env, standard_id), evaluators_dir)


def _write_from_remote(standard_id: str, remote: dict, evaluators_dir: Path) -> dict:
    """Validate and scan *remote*, then write it as this machine's copy with its hash as the base.

    Refuses a file the import validator rejects, and one the injection scan
    flags: nothing is written in either case.
    """
    validation = validate_import(remote)
    if not validation["valid"]:
        raise ShareError("invalid", f"The shared copy of {standard_id} is not a valid standard: "
                                    + "; ".join(validation["errors"]))
    warnings = scan_injection(validation["data"])
    if warnings:
        raise ShareError("unsafe", "This standard contains text that looks like instructions to the "
                                   f"model: {'; '.join(warnings)}. It was not installed.")
    dates = {k: remote[k] for k in _REMOTE_DATED_KEYS if remote.get(k) is not None}
    payload = {**validation["data"], **dates, **_INSTALLED_DEFAULTS, SHARED_HASH_KEY: share_hash(remote)}
    write_standard_payload(_local_path(evaluators_dir, standard_id), payload)
    return {"id": standard_id, "warnings": []}
