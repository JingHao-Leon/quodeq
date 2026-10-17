"""Which files moved between the commits two runs evaluated."""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from quodeq.services.wiring import GIT_FLAG_C, git_stdout

SCOPE_CHANGED = "changed-files"
SCOPE_ALL = "all"
_DIFF = "diff"
_NAME_ONLY = "--name-only"
# Both sides of a rename stay in scope, so the old file's findings can
# resolve and the new file's can match by content instead of reading as new.
_NO_RENAMES = "--no-renames"
# Paths come back relative to the project directory, the way findings spell
# them, and changes elsewhere in a monorepo drop out.
_RELATIVE = "--relative"
_CONFIG = "-c"
_PLAIN_PATHS = "core.quotePath=false"  # non-ASCII names unquoted, so they match findings
# Everything after it is a revision, never an option: a recorded SHA such as
# "--output=<file>" would otherwise make git write that file.
_END_OF_OPTIONS = "--end-of-options"
# The SHAs come from a run's status.json; only an abbreviated or full commit
# hash (SHA-1 or SHA-256) reaches git.
_SHA = re.compile(r"[0-9a-f]{7,64}")
_MEMO_SIZE = 64  # commits are immutable, so a (root, base, head) answer never goes stale


def _is_sha(value: object) -> bool:
    return isinstance(value, str) and _SHA.fullmatch(value) is not None


@lru_cache(maxsize=_MEMO_SIZE)
def changed_files(repo_root: Path | None, base_sha: str | None, head_sha: str | None) -> set[str] | None:
    """Paths (relative to *repo_root*) that differ between the two commits.

    None when the scope cannot be known: no local repo, a missing or
    malformed SHA, or git failing (an unknown commit, a shallow clone).
    Callers fall back to every file and say so."""
    if repo_root is None or not _is_sha(base_sha) or not _is_sha(head_sha):
        return None
    out = git_stdout([
        GIT_FLAG_C, str(repo_root), _CONFIG, _PLAIN_PATHS,
        _DIFF, _NAME_ONLY, _NO_RENAMES, _RELATIVE, _END_OF_OPTIONS, base_sha, head_sha,
    ])
    if out is None:
        return None
    return {line.strip() for line in out.splitlines() if line.strip()}
