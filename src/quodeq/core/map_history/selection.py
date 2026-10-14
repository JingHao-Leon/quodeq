"""A finding selection for the map history: some dimensions, or one principle of one dimension.

The store keeps every finding of a run; a selection filters a stored run when
it is read (``select_run``), before the hidden set and the severity weights
apply, so a selection never rebuilds or changes a stored day.

A selection of dimensions keeps their violations and compliance judgments,
and the files they touch. A principle is narrower than what the store holds
for compliance: judgments are kept per file and dimension, not per principle.
So under a principle every file its dimension checked stays (that is the
"checked" file count a density divides by; a violation the app hides checks
nothing, as it is not shown), its violations are the principle's only, and
its compliance count is not known (0).
"""
from __future__ import annotations

from collections.abc import Collection, Mapping
from dataclasses import dataclass
from typing import NamedTuple

from quodeq.core.map_history.raw_run import RawFile, RawRun, ViolationRecord
from quodeq.core.map_history.snapshot import compliance_mark, finding_dimension

# Every principle of the selected dimensions.
ALL_PRINCIPLES = ""


class SelectionError(ValueError):
    """A selection that cannot be measured: no dimension, a principle without exactly one dimension, or an unknown dimension."""


@dataclass(frozen=True)
class FindingSelection:
    """The findings a map history is measured over: *dimensions*, narrowed to *principle* when one is named."""

    dimensions: frozenset[str]
    principle: str = ALL_PRINCIPLES

    def __post_init__(self) -> None:
        """Refuse a selection without a dimension, or a principle with other than exactly one dimension."""
        if self.principle and len(self.dimensions) != 1:
            raise SelectionError("a principle needs exactly one dimension")
        if not self.dimensions:
            raise SelectionError("a selection needs at least one dimension")

    def keeps(self, record: ViolationRecord) -> bool:
        """True when the violation *record* is one of the selected findings."""
        subject = record.subject
        return subject.dimension in self.dimensions and (not self.principle or subject.principle == self.principle)

    def check_known(self, known: Collection[str]) -> None:
        """Raise SelectionError when a selected dimension is not one of *known* (the project's dimensions)."""
        unknown = sorted(self.dimensions.difference(known))
        if unknown:
            raise SelectionError(f"unknown dimension: {', '.join(unknown)}")


class _Reading(NamedTuple):
    """What a stored run is read with: its records, the record keys the app hides, and the selection."""

    records: Mapping[str, ViolationRecord]
    hidden: Collection[str]
    selection: FindingSelection


def _checked_by(raw: RawFile, reading: _Reading, dimension: str) -> bool:
    """True when *dimension* reported anything shown in the file *raw*: a violation or a compliance judgment."""
    return (any(finding_dimension(m) == dimension for m in raw.marks)
            or any(reading.records[k].subject.dimension == dimension for k in raw.violations if k not in reading.hidden))


def _principle_file(raw: RawFile, reading: _Reading) -> RawFile | None:
    """*raw* narrowed to the principle: its violations, and one countless mark when its dimension checked the file."""
    (dimension,) = reading.selection.dimensions
    if not _checked_by(raw, reading, dimension):
        return None
    violations = tuple(k for k in raw.violations if reading.selection.keeps(reading.records[k]))
    return RawFile(violations, (0,), (compliance_mark(dimension, ()),))


def _dimensions_file(raw: RawFile, reading: _Reading) -> RawFile | None:
    """*raw* narrowed to the selected dimensions; None when none of them reported anything there."""
    selection = reading.selection
    violations = tuple(k for k in raw.violations if selection.keeps(reading.records[k]))
    kept = [(n, m) for n, m in zip(raw.compliance, raw.marks, strict=True)
            if finding_dimension(m) in selection.dimensions]
    if not violations and not kept:
        return None
    return RawFile(violations, tuple(n for n, _ in kept), tuple(m for _, m in kept))


def select_run(run: RawRun, records: Mapping[str, ViolationRecord], selection: FindingSelection,
               hidden: Collection[str] = frozenset()) -> RawRun:
    """*run* with only the *selection*'s findings; a file none of them touch is left out.

    *records* must hold every record key the run refers to; *hidden* are the
    record keys the app hides (``materialise`` leaves them out afterwards).
    """
    reading = _Reading(records, hidden, selection)
    narrow = _principle_file if selection.principle else _dimensions_file
    files = {}
    for path, raw in run.files.items():
        kept = narrow(raw, reading)
        if kept is not None:
            files[path] = kept
    return RawRun(tuple(d for d in run.dims if d in selection.dimensions), files)
