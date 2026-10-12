"""One run's per-file finding stats, the unit the map history is built from."""
from __future__ import annotations

import hashlib
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from quodeq.core.dismissals import DismissedKeys
from quodeq.core.run_diff import identity
from quodeq.core.scoring.constants import SEVERITY_WEIGHT
from quodeq.core.types.severity import Severity

# Verdict codes inside a finding identity ("<dimension>:<verdict>:<hash>"); they are baked into cached ids.
VIOLATION = "v"
COMPLIANCE = "c"
# Where the verdict sits in a finding identity split on ":".
_VERDICT_FIELD = 1
_ID_SEP = ":"
# The severities a file tallies; a violation whose severity is missing or unknown counts as minor.
_SEVERITIES = (Severity.CRITICAL, Severity.MAJOR, Severity.MINOR)
_FALLBACK_SEVERITY = Severity.MINOR
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
    files: dict[str, FileStat]

    def to_json(self) -> dict:
        """Compact JSON form: one positional list per file."""
        return {"dims": list(self.dims), "files": {
            p: [s.critical, s.major, s.minor, s.compliance, s.weight, sorted(s.ids), sorted(s.dims)]
            for p, s in self.files.items()}}

    @classmethod
    def from_json(cls, data: dict) -> RunSnapshot:
        """Inverse of ``to_json``."""
        return cls(tuple(data["dims"]), {
            p: FileStat(c, ma, mi, co, w, frozenset(ids), frozenset(ds))
            for p, (c, ma, mi, co, w, ids, ds) in data["files"].items()})


def is_violation(finding_id: str) -> bool:
    """True when *finding_id* names a violation (not a compliance judgment)."""
    return finding_id.split(_ID_SEP)[_VERDICT_FIELD] == VIOLATION


def _fid(dimension: str, verdict: str, finding: dict) -> str:
    """The dimension-qualified identity of *finding* with its verdict code."""
    raw = repr((dimension, verdict) + identity(finding)).encode()
    return f"{dimension}{_ID_SEP}{verdict}{_ID_SEP}{hashlib.blake2b(raw, digest_size=_ID_BYTES).hexdigest()}"


@dataclass
class _FileTally:
    """Mutable per-file counts while one run's reports are read."""

    counts: dict[str, int] = field(default_factory=lambda: dict.fromkeys(_SEVERITIES, 0))
    compliance: int = 0
    weight: float = 0.0
    ids: set[str] = field(default_factory=set)
    dims: set[str] = field(default_factory=set)

    def frozen(self) -> FileStat:
        """The finished, immutable stat."""
        c = self.counts
        return FileStat(c[Severity.CRITICAL], c[Severity.MAJOR], c[Severity.MINOR], self.compliance, self.weight,
                        frozenset(self.ids), frozenset(self.dims))


def _entries(report: dict, key: str) -> list[dict]:
    """The dict entries with a file of *report*'s *key* list; anything else in the list is skipped."""
    return [e for e in report.get(key) or [] if isinstance(e, dict) and e.get("file")]


def _severity(violation: dict, weights: Mapping[str, float]) -> str:
    """The tallied severity of *violation*: its own when weighted and known, else the fallback."""
    sev = violation.get("severity")
    return sev if sev in weights and sev in _SEVERITIES else _FALLBACK_SEVERITY


def _is_dismissed(finding: dict, dismissed: DismissedKeys) -> bool:
    """True when the user dismissed *finding*."""
    return dismissed.matches(req=finding.get("req"), principle=finding.get("principle"), file=str(finding["file"]),
                             line=finding.get("line"), snippet=finding.get("snippet"))


def _add_report(acc: dict[str, _FileTally], dim: str, report: dict, dismissed: DismissedKeys,
                weights: Mapping[str, float]) -> None:
    """Tally one dimension's report into *acc*."""
    for v in _entries(report, "violations"):
        if _is_dismissed(v, dismissed):
            continue
        sev = _severity(v, weights)
        tally = acc.setdefault(str(v["file"]), _FileTally())
        tally.counts[sev] += 1
        tally.weight += weights.get(sev, 0.0)
        tally.ids.add(_fid(dim, VIOLATION, v))
        tally.dims.add(dim)
    for c in _entries(report, "compliance"):
        tally = acc.setdefault(str(c["file"]), _FileTally())
        tally.compliance += 1
        tally.ids.add(_fid(dim, COMPLIANCE, c))
        tally.dims.add(dim)


def build_run_snapshot(reports: Iterable[tuple[str, object]], dismissed: DismissedKeys,
                       weights: Mapping[str, float] = SEVERITY_WEIGHT) -> RunSnapshot:
    """Per-file stats of one run from its ``(dimension, report)`` pairs.

    *weights* are the grade formula's severity weights (the shipped defaults
    when the caller has no formula). Non-dict reports, and non-dict entries
    or entries without a file in a report's lists, are skipped.
    """
    acc: dict[str, _FileTally] = {}
    dims: set[str] = set()
    for dim, report in reports:
        if isinstance(report, dict):
            dims.add(dim)
            _add_report(acc, dim, report, dismissed, weights)
    return RunSnapshot(tuple(sorted(dims)), {p: t.frozen() for p, t in acc.items()})
