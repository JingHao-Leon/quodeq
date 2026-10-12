"""One run's per-file finding stats, the unit the map history is built from."""
from __future__ import annotations

import hashlib
from collections.abc import Callable, Collection, Iterable, Mapping
from dataclasses import dataclass, field
from types import MappingProxyType

from quodeq.core.run_diff import identity
from quodeq.core.scoring.constants import SEVERITY_WEIGHT
from quodeq.core.types.severity import Severity, parse_severity

# Verdict codes inside a finding identity ("<dimension>:<verdict>:<hash>"); they are baked into cached ids.
VIOLATION = "v"
COMPLIANCE = "c"
_ID_SEP = ":"
# An identity splits from the right into its three fields, so a ':' inside a dimension name cannot shift them.
_ID_FIELDS_AFTER_DIM = 2
_DIM_FIELD, _VERDICT_FIELD = 0, 1
# The severities a file tallies; a violation whose severity is missing or unknown counts as minor.
_SEVERITIES = (Severity.CRITICAL, Severity.MAJOR, Severity.MINOR)
_FALLBACK_SEVERITY = Severity.MINOR
# Bytes of hash kept per finding identity: plenty to tell findings apart within one file.
_ID_BYTES = 6

# ``(dimension, violation) -> True`` when the app hides that violation (dismissed, deleted or rule-matched).
HiddenPredicate = Callable[[str, dict], bool]


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
    """The tallied severity of *violation*: its own when weighted and known, else the fallback.

    Read leniently like the rest of the app (``parse_severity``); a value that
    is not a string at all (model output gone wrong) is the fallback too.
    """
    raw = violation.get("severity")
    sev = parse_severity(raw, _FALLBACK_SEVERITY) if isinstance(raw, str) else _FALLBACK_SEVERITY
    return sev if sev in weights and sev in _SEVERITIES else _FALLBACK_SEVERITY


def _add_report(acc: dict[str, _FileTally], dim: str, report: dict, is_hidden: HiddenPredicate,
                weights: Mapping[str, float]) -> None:
    """Tally one dimension's report into *acc*, skipping the violations *is_hidden* hides."""
    for v in _entries(report, "violations"):
        if is_hidden(dim, v):
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


def build_run_snapshot(reports: Iterable[tuple[str, object]], is_hidden: HiddenPredicate,
                       weights: Mapping[str, float] = SEVERITY_WEIGHT) -> RunSnapshot:
    """Per-file stats of one run from its ``(dimension, report)`` pairs.

    *is_hidden* is the app's suppression predicate: a violation it hides is
    not counted (compliance judgments are never hidden). *weights* are the grade formula's severity weights (the shipped defaults
    when the caller has no formula). Non-dict reports, and non-dict entries
    or entries without a file in a report's lists, are skipped.
    """
    acc: dict[str, _FileTally] = {}
    dims: set[str] = set()
    for dim, report in reports:
        if isinstance(report, dict):
            dims.add(dim)
            _add_report(acc, dim, report, is_hidden, weights)
    return RunSnapshot(tuple(sorted(dims)), {p: t.frozen() for p, t in acc.items()})
