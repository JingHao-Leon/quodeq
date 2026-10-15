"""Rules for sharing custom standards through the shared repository (pure, no I/O).

What travels (``shareable_payload``), what makes two copies the same
standard (``share_hash``), and how a local copy compares with the shared one
(``sync_state``). See docs spec 2026-10-15-standards-sharing-design.md.
"""
from __future__ import annotations

import hashlib
import json
from enum import StrEnum

from quodeq.shared.utils import TEXT_ENCODING

MACHINE_KEYS = frozenset({"managed", "origin", "origin_hash", "shared_hash"})
# Travel with the standard but never make two copies look different.
_DATED_KEYS = frozenset({"createdAt", "updatedAt", "version", "publishedAt"})
SHARED_HASH_KEY = "shared_hash"


class SyncState(StrEnum):
    """How a custom standard on this machine compares with the shared repository."""

    NEVER_SHARED = "never_shared"
    PUBLISHED = "published"
    CHANGED = "changed"
    UPDATE_AVAILABLE = "update_available"
    DIVERGED = "diverged"
    REMOTE_ONLY = "remote_only"
    REMOVED_REMOTELY = "removed_remotely"


def shareable_payload(data: dict) -> dict:
    """*data* without the machine-local keys: what a share pushes."""
    return {k: v for k, v in data.items() if k not in MACHINE_KEYS}


def share_hash(data: dict) -> str:
    """Identity of a standard's content: dates, version and machine keys ignored."""
    content = {k: v for k, v in data.items() if k not in MACHINE_KEYS and k not in _DATED_KEYS}
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode(TEXT_ENCODING)).hexdigest()


def sync_state(local: dict | None, remote: dict | None) -> SyncState | None:
    """Compare a local evaluator file with its shared copy (either may be absent)."""
    if local is None:
        return SyncState.REMOTE_ONLY if remote is not None else None
    base = local.get(SHARED_HASH_KEY) if isinstance(local.get(SHARED_HASH_KEY), str) else None
    if remote is None:
        return SyncState.REMOVED_REMOTELY if base else SyncState.NEVER_SHARED
    mine, theirs = share_hash(local), share_hash(remote)
    if mine == theirs:
        return SyncState.PUBLISHED
    if base is None:
        return SyncState.DIVERGED
    if mine == base:
        return SyncState.UPDATE_AVAILABLE
    return SyncState.CHANGED if theirs == base else SyncState.DIVERGED
