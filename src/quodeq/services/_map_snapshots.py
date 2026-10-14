"""The map history's raw runs made into snapshots: the app's suppression and the grade weights applied when read,
and, under a finding selection, the selected findings only (the stored runs are never filtered)."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import replace
from typing import NamedTuple

from quodeq.core.map_history.raw_run import RawRun, ViolationRecord, materialise, referenced_records
from quodeq.core.map_history.selection import FindingSelection, select_run
from quodeq.core.map_history.snapshot import RunSnapshot
from quodeq.services._violation_filters import is_suppressed_subject
from quodeq.services.scoring import ProjectRows
from quodeq.services.suppression_keys import SuppressionKeys
from quodeq.services.wiring import load_suppression_rules


class Snapshots(NamedTuple):
    """Each run's snapshot, and its snapshot of the selected findings only (``snapshots`` itself without a selection)."""

    snapshots: list[RunSnapshot]
    selected: list[RunSnapshot]


def _suppression_keys(rows: ProjectRows) -> SuppressionKeys:
    """The project's dismissed, deleted and pattern-rule state."""
    return replace(rows.keys, rules=load_suppression_rules(rows.reports_root / rows.project))


def _hidden(rows: ProjectRows, records: Mapping[str, ViolationRecord], needed: set[str]) -> frozenset[str]:
    """The record keys of *needed* the app hides, each distinct record judged once."""
    keys = _suppression_keys(rows)
    return frozenset(k for k in needed if is_suppressed_subject(records[k].subject, keys))


def run_snapshots(rows: ProjectRows, runs: Sequence[RawRun], records: Mapping[str, ViolationRecord],
                  selection: FindingSelection | None) -> Snapshots:
    """*runs* as the app shows them, and as the *selection* narrows them when one is given.

    *records* must hold every record key the runs refer to.
    """
    hidden = _hidden(rows, records, referenced_records(runs))
    weights: Mapping[str, float] = rows.params.severity_weight
    snapshots = [materialise(run, records, hidden, weights) for run in runs]
    if selection is None:
        return Snapshots(snapshots, snapshots)
    return Snapshots(snapshots, [materialise(select_run(run, records, selection, hidden), records, hidden, weights)
                                 for run in runs])
