"""Share, install and update custom standards through the shared repository.

Runs synchronously under the clone lock: one small file per call. Git and
file mechanics come from data/ via the wiring modules; the rules come from
``standards_sharing``. ``PublishError`` is reached through
``services.shared_publish`` at call time, like ``_publish_git`` does, and the
push goes through ``_publish_git``, so the tests that patch
``shared_publish.run_git`` intercept it too.
"""
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from quodeq.services import shared_publish
from quodeq.services.standards_share_content import extra_texts, normalized_for_share
from quodeq.services._publish_git import prepare_clone, push_with_rebase_fallback
from quodeq.services.import_validator import scan_injection, scan_text, validate_import
from quodeq.services.standards_sharing import (
    SHARED_HASH_KEY, SyncState, now_utc_iso, share_hash, shareable_payload, sync_state,
)
from quodeq.services.wiring import (
    RepoFormat, bootstrap_repo_layout, clone_lock, read_standard_payload,
    resolve_jailed_standard_path, write_standard_payload,
)
from quodeq.services.wiring_sync import (
    commit_staged, read_shared_standards, reset_clone_to_remote, restore_shared_standards,
    shared_standards_dir, stage_standard_paths, write_shared_standard,
)

_PUBLISHED_AT = "publishedAt"
_VERSION_KEY = "version"
_REMOTE_DATED_KEYS = ("createdAt", "updatedAt", _VERSION_KEY)
_MAX_DATED_LEN = 40  # an ISO timestamp or a YYYY.MM.DD version, with room to spare
_INSTALLED_DEFAULTS = {"type": "custom", "managed": False, "origin": None, "origin_hash": None}
_MALFORMED = (TypeError, AttributeError, ValueError, KeyError)
_LOCAL_EDITS = frozenset({SyncState.CHANGED, SyncState.DIVERGED})


class ShareError(Exception):
    """A share/install/update the user can act on; *code* is the API error code.

    Codes: ``not_found``, ``builtin``, ``conflict``, ``unsafe``,
    ``invalid``, ``git``. The message is user-facing.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


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
    _restore(repo)
    return repo


def _restore(repo: Path) -> None:
    """Drop what a failed share or publish left in ``standards/`` (see ``restore_shared_standards``)."""
    ok, out = restore_shared_standards(repo)
    if not ok:
        raise ShareError("git", f"Could not reset the shared standards folder: {_snippet(out)}")


def _snippet(out: str) -> str:
    return out.strip()[:shared_publish.GIT_ERROR_SNIPPET_MAX_CHARS]


def _commit_and_push_standards(repo: Path, url: str, standard_ids: list[str], message: str,
                               env: dict | None) -> None:
    """Stage the standard files, commit them when anything changed, and push.

    Pushes even when nothing new was staged. When the push fails the clone
    goes back to the remote (``reset_clone_to_remote``), so the listing and
    an install on this machine never read the unpushed copy as shared.
    """
    ok, out = stage_standard_paths(repo, standard_ids)
    if not ok:
        raise ShareError("git", f"git add failed: {_snippet(out)}")
    ok, out = commit_staged(repo, message)
    if not ok:
        raise ShareError("git", f"git commit failed: {_snippet(out)}")
    try:
        push_with_rebase_fallback(repo, env)
    except shared_publish.PublishError as exc:
        reset_clone_to_remote(url, env)
        raise _git_error(exc) from exc


def _refuse_newer_shared(standard_id: str, local: dict, shared: dict | None, force: bool) -> None:
    """Refuse a share that would overwrite a shared copy this machine has not pulled.

    ``update_available`` is always refused (nothing of yours to publish);
    ``diverged`` only without *force*. A shared copy that cannot be compared
    counts as diverged: it is replaced only on purpose.
    """
    try:
        state = sync_state(local, shared)
    except _MALFORMED:
        state = SyncState.DIVERGED
    if state == SyncState.UPDATE_AVAILABLE or (state == SyncState.DIVERGED and not force):
        raise ShareError("conflict", f"The shared copy of {standard_id} changed since you last pulled. "
                                     "Update first, or publish yours to replace it.")


def share_standard(standard_id: str, *, url: str, evaluators_dir: Path, env: dict | None = None,
                   is_builtin: Callable[[str], bool] = _never_builtin, force: bool = False) -> dict:
    """Push this machine's copy of *standard_id* to ``standards/<id>.json``.

    Refused when the shared copy moved on since the last pull (see
    ``_refuse_newer_shared``; *force* replaces a diverged one). The base
    recorded afterwards is the hash of what was pushed, written onto the
    file as it is now: an edit made during the push reads as ``changed``.
    ``publishedAt`` comes from ``now_utc_iso``, looked up per call.
    """
    _no_builtin(standard_id, is_builtin)
    local = _local(evaluators_dir, standard_id)
    if local is None:
        raise ShareError("not_found", f"No custom standard named {standard_id} on this machine.")
    published_at = now_utc_iso()
    with clone_lock(url, env):
        repo = _prepared(url, env)
        folder = shared_standards_dir(url, env)
        _refuse_newer_shared(standard_id, local, read_shared_standards(folder).get(standard_id), force)
        try:
            write_shared_standard(folder, standard_id,
                                  {**shareable_payload(local), _PUBLISHED_AT: published_at})
        except (OSError, ValueError) as exc:
            raise ShareError("invalid", f"Could not write {standard_id} into the shared repository.") from exc
        _commit_and_push_standards(repo, url, [standard_id], f"standards: publish {standard_id}", env)
    fresh = _local(evaluators_dir, standard_id) or local
    _write_local(evaluators_dir, standard_id, {**fresh, SHARED_HASH_KEY: share_hash(local)})
    return {"id": standard_id, "publishedAt": published_at}


def _remote(url: str, env: dict | None, standard_id: str) -> dict:
    folder = shared_standards_dir(url, env)
    _restore(folder.parent)
    remote = read_shared_standards(folder).get(standard_id)
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
        if local is not None and _compared(standard_id, local, remote) != SyncState.PUBLISHED:
            raise ShareError("conflict", f"A different standard named {standard_id} already exists here. "
                                         "Duplicate it to keep both, then install again.")
        return _write_from_remote(standard_id, remote, evaluators_dir)


def _compared(standard_id: str, local: dict, remote: dict) -> SyncState:
    """``sync_state`` of this machine's copy and a shared one not validated yet.

    A shape the hash cannot read is ``invalid``, naming whichever copy it is.
    """
    try:
        share_hash(remote)
    except _MALFORMED as exc:
        raise ShareError("invalid", f"The shared copy of {standard_id} is not a valid standard.") from exc
    try:
        return sync_state(local, remote)
    except _MALFORMED as exc:
        raise ShareError("invalid", f"The standard file for {standard_id} on this machine "
                                    "is not a valid standard.") from exc


def update_from_shared(standard_id: str, *, url: str, evaluators_dir: Path, env: dict | None = None,
                       is_builtin: Callable[[str], bool] = _never_builtin, force: bool = False) -> dict:
    """Replace this machine's copy with the shared one (theirs wins).

    A no-op when both already match; local changes (``changed`` or
    ``diverged``) are replaced only with *force*.
    """
    _no_builtin(standard_id, is_builtin)
    with clone_lock(url, env):
        local = _local(evaluators_dir, standard_id)
        if local is None:
            raise ShareError("not_found", f"No custom standard named {standard_id} on this machine.")
        remote = _remote(url, env, standard_id)
        state = _compared(standard_id, local, remote)
        if state == SyncState.PUBLISHED:
            return {"id": standard_id, "warnings": []}
        if state in _LOCAL_EDITS and not force:
            raise ShareError("conflict", f"{standard_id} has local changes. Publish them, "
                                         "or update with force to replace them.")
        return _write_from_remote(standard_id, remote, evaluators_dir)


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
    payload = {**content, **_remote_dates(remote), **_INSTALLED_DEFAULTS}
    _write_local(evaluators_dir, standard_id, {**payload, SHARED_HASH_KEY: share_hash(payload)})
    return {"id": standard_id, "warnings": []}


def _remote_dates(remote: dict) -> dict:
    """The remote's dates and version, kept only when well typed: a short string (or an int version)."""
    return {k: remote[k] for k in _REMOTE_DATED_KEYS
            if (isinstance(remote.get(k), str) and len(remote[k]) <= _MAX_DATED_LEN)
            or (k == _VERSION_KEY and type(remote.get(k)) is int)}


def _extra_text_warnings(content: dict) -> list[str]:
    """Injection warnings for the share extras (hints, names, parameter labels)."""
    return [f"Suspicious text in {where}: {w}" for where, text in extra_texts(content) for w in scan_text(text)]
