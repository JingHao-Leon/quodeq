"""One run's per-file finding stats, the unit the map history is built from."""
from __future__ import annotations

import hashlib
from collections.abc import Iterable
from dataclasses import dataclass, field

from quodeq.core.dismissals import DismissedKeys
from quodeq.core.run_diff import identity

SEVERITY_WEIGHTS = {"critical": 4.0, "major": 2.0, "minor": 0.25}
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


def _fid(dimension: str, verdict: str, finding: dict) -> str:
    raw = repr((dimension, verdict) + identity(finding)).encode()
    return f"{dimension}:{verdict}:{hashlib.blake2b(raw, digest_size=_ID_BYTES).hexdigest()}"


def build_run_snapshot(reports: Iterable[tuple[str, object]], dismissed: DismissedKeys) -> RunSnapshot:
    """Per-file stats of one run from its ``(dimension, report)`` pairs; non-dict reports are skipped."""
    acc: dict[str, dict] = {}
    dims: set[str] = set()

    def slot(file: str) -> dict:
        return acc.setdefault(file, {"critical": 0, "major": 0, "minor": 0, "compliance": 0, "weight": 0.0, "ids": set(), "dims": set()})

    for dim, report in reports:
        if not isinstance(report, dict):
            continue
        dims.add(dim)
        for v in report.get("violations") or []:
            file = str(v.get("file") or "")
            if not file or dismissed.matches(req=v.get("req"), principle=v.get("principle"), file=file, line=v.get("line"), snippet=v.get("snippet")):
                continue
            sev = v.get("severity") if v.get("severity") in SEVERITY_WEIGHTS else "minor"
            s = slot(file)
            s[sev] += 1
            s["weight"] += SEVERITY_WEIGHTS[sev]
            s["ids"].add(_fid(dim, "v", v))
            s["dims"].add(dim)
        for c in report.get("compliance") or []:
            file = str(c.get("file") or "")
            if not file:
                continue
            s = slot(file)
            s["compliance"] += 1
            s["ids"].add(_fid(dim, "c", c))
            s["dims"].add(dim)
    files = {p: FileStat(s["critical"], s["major"], s["minor"], s["compliance"], s["weight"],
                         frozenset(s["ids"]), frozenset(s["dims"])) for p, s in acc.items()}
    return RunSnapshot(tuple(sorted(dims)), files)
