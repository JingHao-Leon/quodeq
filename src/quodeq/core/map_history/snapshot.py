"""One run's per-file finding stats, the unit the map history is built from."""
from __future__ import annotations

import hashlib
from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass, field
from types import MappingProxyType

from quodeq.core.run_diff import identity

# Verdict codes inside a finding identity ("<dimension>:<verdict>:<hash>"); they are baked into cached ids.
VIOLATION = "v"
COMPLIANCE = "c"
_ID_SEP = ":"
# An identity splits from the right into its three fields, so a ':' inside a dimension name cannot shift them.
_ID_FIELDS_AFTER_DIM = 2
_DIM_FIELD, _VERDICT_FIELD = 0, 1
# Bytes of hash kept per finding identity: plenty to tell findings apart within one file.
_ID_BYTES = 6


@dataclass(frozen=True)
class FileStat:
    """One file's finding counts, severity weight and finding identities in a run."""

    critical: int = 0
    major: int = 0
    minor: int = 0
    compliance: int = 0
    weight: float = 0.0
    ids: frozenset[str] = field(default_factory=frozenset)   # dimension-qualified finding identities (violations + compliance)
    dims: frozenset[str] = field(default_factory=frozenset)  # dimensions with any finding in this file

    @property
    def violations(self) -> int:
        """Total violations across severities."""
        return self.critical + self.major + self.minor


@dataclass(frozen=True)
class RunSnapshot:
    """Per-file stats of one run, plus the dimensions that reported."""

    dims: tuple[str, ...]
    files: Mapping[str, FileStat]   # read-only view, so the frozen snapshot cannot be changed through it

    def __post_init__(self) -> None:
        """Hold *files* as a read-only copy."""
        object.__setattr__(self, "files", MappingProxyType(dict(self.files)))


def finding_dimension(finding_id: str) -> str:
    """The dimension that reported *finding_id* (its leading field)."""
    return finding_id.rsplit(_ID_SEP, _ID_FIELDS_AFTER_DIM)[_DIM_FIELD]


def ids_in_dims(ids: Iterable[str], dims: Collection[str]) -> frozenset[str]:
    """The finding identities of *ids* reported by one of *dims*."""
    return frozenset(i for i in ids if finding_dimension(i) in dims)


def is_violation(finding_id: str) -> bool:
    """True when *finding_id* names a violation (not a compliance judgment)."""
    return finding_id.rsplit(_ID_SEP, _ID_FIELDS_AFTER_DIM)[_VERDICT_FIELD] == VIOLATION


def _hashed_id(dimension: str, verdict: str, raw: bytes) -> str:
    """``<dimension>:<verdict>:<hash>`` of *raw*."""
    digest = hashlib.blake2b(raw, digest_size=_ID_BYTES).hexdigest()
    return f"{dimension}{_ID_SEP}{verdict}{_ID_SEP}{digest}"


def finding_id(dimension: str, verdict: str, finding: dict) -> str:
    """The dimension-qualified identity of *finding* with its verdict code (the ids flows and ages compare)."""
    return _hashed_id(dimension, verdict, repr((dimension, verdict) + identity(finding)).encode())


def compliance_mark(dimension: str, findings: Iterable[dict]) -> str:
    """One id for all of a file's compliance judgments in *dimension*: equal sets give equal marks."""
    raw = repr((dimension, COMPLIANCE, sorted({repr(identity(f)) for f in findings}))).encode()
    return _hashed_id(dimension, COMPLIANCE, raw)
