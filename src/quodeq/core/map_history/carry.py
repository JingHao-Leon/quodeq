"""Runs as the accumulated view: each dimension a run did not report is carried from the latest earlier run.

The page header counts each dimension's newest report across runs. A map
history run that skipped a dimension would otherwise count none of its
findings, so its totals, flows and ages would not read like the header; with
the dimension carried, they do. Carrying works on raw runs, before suppression
and the grade weights apply.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence

from quodeq.core.map_history.raw_run import RawFile, RawRun, ViolationRecord
from quodeq.core.map_history.snapshot import finding_dimension

# One dimension's part of a run: per path, that dimension's raw findings only.
_Slice = dict[str, RawFile]
_NO_SLICE: _Slice = {}


def _split(run: RawRun, records: Mapping[str, ViolationRecord]) -> dict[str, _Slice]:
    """*run*'s files cut per dimension; a dimension the run reported without a finding has no slice."""
    parts: dict[str, dict[str, tuple[list[str], list[int], list[str]]]] = {}

    def part(dim: str, path: str) -> tuple[list[str], list[int], list[str]]:
        return parts.setdefault(dim, {}).setdefault(path, ([], [], []))

    for path, raw in run.files.items():
        for key in raw.violations:
            part(records[key].subject.dimension, path)[0].append(key)
        for count, mark in zip(raw.compliance, raw.marks, strict=True):
            _, counts, marks = part(finding_dimension(mark), path)
            counts.append(count)
            marks.append(mark)
    return {dim: {p: RawFile(tuple(v), tuple(c), tuple(m)) for p, (v, c, m) in files.items()}
            for dim, files in parts.items()}


def _merged(a: RawFile, b: RawFile) -> RawFile:
    """The findings of *a* and *b* (of different dimensions) in one file."""
    marks = sorted(zip(a.marks + b.marks, a.compliance + b.compliance))
    return RawFile(tuple(sorted(a.violations + b.violations)), tuple(n for _, n in marks), tuple(m for m, _ in marks))


def _with_slices(run: RawRun, carried: Mapping[str, _Slice]) -> RawRun:
    """*run* plus the *carried* dimensions' slices."""
    files = dict(run.files)
    for part in carried.values():
        for path, raw in part.items():
            files[path] = _merged(files[path], raw) if path in files else raw
    return RawRun(tuple(sorted({*run.dims, *carried})), files)


class _Slices:
    """Each run's per-dimension slices, cut once when first asked for."""

    def __init__(self, runs: Sequence[RawRun], records: Mapping[str, ViolationRecord]) -> None:
        self.runs, self.records = runs, records
        self.cut: dict[int, dict[str, _Slice]] = {}

    def of(self, k: int, dim: str) -> _Slice:
        """Run *k*'s slice of *dim* (empty when it reported nothing there)."""
        if k not in self.cut:
            self.cut[k] = _split(self.runs[k], self.records)
        return self.cut[k].get(dim, _NO_SLICE)


def carry_forward(runs: Sequence[RawRun], records: Mapping[str, ViolationRecord]) -> list[RawRun]:
    """*runs* (oldest first), each with every dimension an earlier run reported and it did not, as last reported.

    A dimension a run reported replaces what was carried, even when the run
    found nothing there. A run that reported every dimension seen so far is
    returned as it is. *records* must hold every record key the runs refer to.
    """
    slices = _Slices(runs, records)
    source: dict[str, int] = {}   # each dimension's latest run so far
    out: list[RawRun] = []
    for k, run in enumerate(runs):
        missing = {dim: j for dim, j in source.items() if dim not in run.dims}
        out.append(_with_slices(run, {dim: slices.of(j, dim) for dim, j in missing.items()}) if missing else run)
        source.update(dict.fromkeys(run.dims, k))
    return out
