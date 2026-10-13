"""One run's findings as stored: raw, before the app's suppression and the grade weights apply.

A run keeps, per file, the keys of its violation records (each record is held
once per project), its compliance count and one compliance mark per
dimension. ``materialise`` applies the hidden set and the severity weights,
so a dismissal, a deletion, a pattern rule or a grade-formula change never
rebuilds a stored run.
"""
from __future__ import annotations

import hashlib
from collections.abc import Callable, Collection, Iterable, Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import NamedTuple

from quodeq.core.finding_identity import SuppressionSubject
from quodeq.core.map_history.snapshot import (
    VIOLATION, FileStat, RunSnapshot, compliance_mark, finding_dimension, finding_id,
)
from quodeq.core.scoring.constants import SEVERITY_WEIGHT
from quodeq.core.types.severity import Severity, parse_severity

# ``(dimension, violation) -> subject``: what the app's suppression predicate reads of a violation.
SubjectOf = Callable[[str, dict], SuppressionSubject]
# The severities a file tallies; a violation whose severity is missing or unknown counts as minor.
_SEVERITIES = (Severity.CRITICAL, Severity.MAJOR, Severity.MINOR)
_FALLBACK_SEVERITY = Severity.MINOR
# Bytes of hash in a record key: ample for the tens of thousands of distinct findings of a project.
_KEY_BYTES = 6


class ViolationRecord(NamedTuple):
    """One distinct violation: what suppression reads, its reported severity and its finding identity."""

    subject: SuppressionSubject
    severity: str   # as reported; "" when the report's value was not text
    fid: str        # ``finding_id(dimension, VIOLATION, violation)``


def record_key(record: ViolationRecord) -> str:
    """The content key of *record*: equal records share one key."""
    return hashlib.blake2b(repr(record).encode(), digest_size=_KEY_BYTES).hexdigest()


@dataclass(frozen=True)
class RawFile:
    """One file in one stored run."""

    violations: tuple[str, ...] = ()   # record keys, sorted; a repeated finding is listed once per occurrence
    compliance: int = 0
    marks: tuple[str, ...] = ()        # one ``compliance_mark`` per dimension with compliance here, sorted


@dataclass(frozen=True)
class RawRun:
    """A stored run: the dimensions that reported and each file's raw findings."""

    dims: tuple[str, ...]
    files: Mapping[str, RawFile]

    def __post_init__(self) -> None:
        """Hold *files* as a read-only copy."""
        object.__setattr__(self, "files", MappingProxyType(dict(self.files)))


class RawRunBuild(NamedTuple):
    """A run read from its reports, with the records its files refer to."""

    run: RawRun
    records: dict[str, ViolationRecord]


class RawHistory(NamedTuple):
    """What the store holds for a project: runs by id and the records they refer to."""

    runs: dict[str, RawRun]
    records: dict[str, ViolationRecord]


class RawHistoryWrite(NamedTuple):
    """One save: fresh runs (``run_id -> (key, run)``), their records, and what stays stored."""

    runs: dict[str, tuple[str, RawRun]]
    records: dict[str, ViolationRecord]
    keep_runs: set[str]
    keep_records: set[str]


@dataclass
class _Tally:
    """Mutable per-file raw findings while one run's reports are read."""

    violations: list[str] = field(default_factory=list)
    compliance: int = 0
    by_dim: dict[str, list[dict]] = field(default_factory=dict)

    def frozen(self) -> RawFile:
        """The finished, immutable file."""
        marks = tuple(sorted(compliance_mark(dim, found) for dim, found in self.by_dim.items()))
        return RawFile(tuple(sorted(self.violations)), self.compliance, marks)


def _entries(report: dict, key: str) -> list[dict]:
    """The dict entries with a file of *report*'s *key* list; anything else in the list is skipped."""
    return [e for e in report.get(key) or [] if isinstance(e, dict) and e.get("file")]


def _severity_text(violation: dict) -> str:
    """The reported severity when it is text, else "" (read as the fallback when materialised)."""
    raw = violation.get("severity")
    return raw if isinstance(raw, str) else ""


class _RunReader:
    """Accumulates one run's reports into file tallies and violation records."""

    def __init__(self, subject_of: SubjectOf) -> None:
        self.subject_of = subject_of
        self.files: dict[str, _Tally] = {}
        self.records: dict[str, ViolationRecord] = {}
        self.dims: set[str] = set()

    def add(self, dim: str, report: dict) -> None:
        """Read one dimension's report."""
        self.dims.add(dim)
        for v in _entries(report, "violations"):
            record = ViolationRecord(self.subject_of(dim, v), _severity_text(v), finding_id(dim, VIOLATION, v))
            key = record_key(record)
            self.records[key] = record
            self.files.setdefault(str(v["file"]), _Tally()).violations.append(key)
        for c in _entries(report, "compliance"):
            tally = self.files.setdefault(str(c["file"]), _Tally())
            tally.compliance += 1
            tally.by_dim.setdefault(dim, []).append(c)


def build_raw_run(reports: Iterable[tuple[str, object]], subject_of: SubjectOf) -> RawRunBuild:
    """One run's raw findings from its ``(dimension, report)`` pairs; nothing is hidden or weighed here.

    Non-dict reports, and non-dict entries or entries without a file in a
    report's lists, are skipped.
    """
    reader = _RunReader(subject_of)
    for dim, report in reports:
        if isinstance(report, dict):
            reader.add(dim, report)
    run = RawRun(tuple(sorted(reader.dims)), {p: t.frozen() for p, t in reader.files.items()})
    return RawRunBuild(run, reader.records)


def tallied_severity(raw: str, weights: Mapping[str, float]) -> str:
    """The severity a violation is tallied under: its own when known and weighted, else minor."""
    sev = parse_severity(raw, _FALLBACK_SEVERITY) if raw else _FALLBACK_SEVERITY
    return sev if sev in weights and sev in _SEVERITIES else _FALLBACK_SEVERITY


def _file_stat(raw: RawFile, records: Mapping[str, ViolationRecord], hidden: Collection[str],
               weights: Mapping[str, float]) -> FileStat | None:
    """*raw* without its hidden records, weighed; None when nothing of the file is left."""
    counts = dict.fromkeys(_SEVERITIES, 0)
    weight = 0.0
    ids = set(raw.marks)
    dims = {finding_dimension(m) for m in raw.marks}
    for key in raw.violations:
        if key in hidden:
            continue
        record = records[key]
        sev = tallied_severity(record.severity, weights)
        counts[sev] += 1
        weight += weights.get(sev, 0.0)
        ids.add(record.fid)
        dims.add(record.subject.dimension)
    if not ids:
        return None
    return FileStat(counts[Severity.CRITICAL], counts[Severity.MAJOR], counts[Severity.MINOR], raw.compliance,
                    weight, frozenset(ids), frozenset(dims))


def materialise(run: RawRun, records: Mapping[str, ViolationRecord], hidden: Collection[str],
                weights: Mapping[str, float] = SEVERITY_WEIGHT) -> RunSnapshot:
    """The snapshot the app shows of *run*: *hidden* record keys left out, severities weighed with *weights*.

    A file whose findings are all hidden and that has no compliance is not in
    the snapshot, as if the run never reported it.
    """
    files = {}
    for path, raw in run.files.items():
        stat = _file_stat(raw, records, hidden, weights)
        if stat is not None:
            files[path] = stat
    return RunSnapshot(run.dims, files)


def referenced_records(runs: Iterable[RawRun]) -> set[str]:
    """Every record key the files of *runs* refer to."""
    return {key for run in runs for raw in run.files.values() for key in raw.violations}
