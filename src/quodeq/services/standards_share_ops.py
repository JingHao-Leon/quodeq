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
from quodeq.services.standards_share_content import extra_texts, normalized_for_share
from quodeq.services._publish_git import prepare_clone, push_with_rebase_fallback
from quodeq.services.import_validator import scan_injection, scan_text, validate_import
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
        self.message = message


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


def _no_builtin(standard_id: str, is_builtin: Callable[[str], bool]) -> None:
    if is_builtin(standard_id):
        raise ShareError("builtin", f"{standard_id} is a built-in standard and cannot be installed "
                                    "from the shared repository.")


def _never_builtin(_standard_id: str) -> bool:
    return False


def _write_local(evaluators_dir: Path, standard_id: str, payload: dict) -> None:
    try:
        write_standard_payload(_local_path(evaluators_dir, standard_id), payload)
    except OSError as exc:
        raise ShareError("invalid", f"Could not write the standard file for {standard_id} "
                                    "on this machine.") from exc


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
            shared_publish.logger.warning("Could not lay out the shared clone %s: %s", repo, exc)
            raise ShareError("git", "Could not lay out the shared repository.") from exc
    return repo


def _snippet(out: str) -> str:
    return out.strip()[:shared_publish.GIT_ERROR_SNIPPET_MAX_CHARS]


def _commit_and_push_standards(repo: Path, standard_ids: list[str], message: str,
                               env: dict | None) -> None:
    """Stage the standard files, commit them when anything changed, and push.

    Pushes even when nothing new was staged. A commit whose push failed
    stays local only until the next ``_prepared``: its refresh hard-resets
    the clone to the remote whenever the fetch succeeds, so the share must
    be repeated (the local file has no new ``shared_hash`` in that case).
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
                   now: Callable[[], str] = now_utc_iso, env: dict | None = None,
                   is_builtin: Callable[[str], bool] = _never_builtin) -> dict:
    """Push this machine's copy of *standard_id* to ``standards/<id>.json`` (yours wins).

    The base recorded afterwards is the hash of what was pushed, written onto
    the file as it is now: an edit made during the push reads as ``changed``.
    """
    _no_builtin(standard_id, is_builtin)
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
    fresh = _local(evaluators_dir, standard_id) or local
    _write_local(evaluators_dir, standard_id, {**fresh, SHARED_HASH_KEY: share_hash(local)})
    return {"id": standard_id, "publishedAt": published_at}


def _remote(url: str, env: dict | None, standard_id: str) -> dict:
    remote = read_shared_standards(shared_standards_dir(url, env)).get(standard_id)
    if remote is None:
        raise ShareError("not_found", f"{standard_id} is not in the shared repository.")
    return remote


def install_standard(standard_id: str, *, url: str, evaluators_dir: Path, env: dict | None = None,
                     is_builtin: Callable[[str], bool] = _never_builtin) -> dict:
    """Copy ``standards/<id>.json`` from the clone into this machine's library (left off).

    An existing local file is replaced only when its content already equals
    the shared copy; anything else is a conflict (duplicate to keep both).
    """
    _no_builtin(standard_id, is_builtin)
    with clone_lock(url, env):
        local = _local(evaluators_dir, standard_id)
        remote = _remote(url, env, standard_id)
        if local is not None and share_hash(local) != share_hash(remote):
            raise ShareError("conflict", f"A different standard named {standard_id} already exists here. "
                                         "Duplicate it to keep both, then install again.")
        return _write_from_remote(standard_id, remote, evaluators_dir)


def update_from_shared(standard_id: str, *, url: str, evaluators_dir: Path, env: dict | None = None,
                       is_builtin: Callable[[str], bool] = _never_builtin) -> dict:
    """Replace this machine's copy with the shared one (theirs wins)."""
    _no_builtin(standard_id, is_builtin)
    with clone_lock(url, env):
        if _local(evaluators_dir, standard_id) is None:
            raise ShareError("not_found", f"No custom standard named {standard_id} on this machine.")
        return _write_from_remote(standard_id, _remote(url, env, standard_id), evaluators_dir)


def _write_from_remote(standard_id: str, remote: dict, evaluators_dir: Path) -> dict:
    """Validate and scan *remote*, then write it as this machine's copy with its hash as the base.

    ``validate_import`` is the structural gate; what is written is its
    sanitized data plus the well-typed extras a duplicated built-in carries
    (``normalized_for_share``). Refuses a file the validator rejects, and one the
    injection scan flags: nothing is written in either case. The base is the
    hash of what was written.
    """
    validation = validate_import(remote)
    if not validation["valid"]:
        raise ShareError("invalid", f"The shared copy of {standard_id} is not a valid standard: "
                                    + "; ".join(validation["errors"]))
    content = normalized_for_share(remote)
    warnings = scan_injection(content) + _extra_text_warnings(content)
    if warnings:
        raise ShareError("unsafe", "This standard contains text that looks like instructions to the "
                                   f"model: {'; '.join(warnings)}. It was not installed.")
    dates = {k: remote[k] for k in _REMOTE_DATED_KEYS if remote.get(k) is not None}
    payload = {**content, **dates, **_INSTALLED_DEFAULTS}
    _write_local(evaluators_dir, standard_id, {**payload, SHARED_HASH_KEY: share_hash(payload)})
    return {"id": standard_id, "warnings": []}


def _extra_text_warnings(content: dict) -> list[str]:
    """Injection warnings for the share extras (hints, names, parameter labels)."""
    return [f"Suspicious text in {where}: {w}" for where, text in extra_texts(content) for w in scan_text(text)]
