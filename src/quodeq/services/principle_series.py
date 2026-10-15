"""One dimension's per-principle score series, read from the score-cache rows.

The dimension and principle pages ask for it on demand
(``GET .../dimensions/<dimension>/principle-series``); the trend rows stay
free of principles. Each row is one run of the trend's history window that
scored the dimension, newest first, with every graded principle's score,
grade and active-violation counts. The rows come from the same row fetcher
the trend and ``/scores`` read (``ProjectRows``), so a dismissal, deletion,
suppression rule or formula change moves the series through the same per-run
cache versions as the dimension scores, and a repeat call is one bulk read of
the cached rows.
"""
from __future__ import annotations

from pathlib import Path

from quodeq.core.run.state import RunState
from quodeq.core.types.principle_counts import principles_with_counts
from quodeq.core.types.principle_series import PrincipleSeries, PrincipleSeriesRun
from quodeq.services.scoring import ProjectRows, max_history_runs, run_rows
from quodeq.services.scoring_view import select_trend_runs
from quodeq.services.wiring import RunInfo, load_project_standards, settings_reports_root
from quodeq.shared.validation import validate_path_segment


class UnknownDimension(LookupError):
    """No run in the project's history scored the dimension asked for."""

    def __init__(self, dimension: str) -> None:
        super().__init__(dimension)
        #: The 404 body's text: written for the reader, never the exception repr.
        self.public_message = f"No evaluation in this project scored the dimension '{dimension}'"


def build_principle_series(reports_root: Path, project: str, dimension: str) -> PrincipleSeries:
    """*dimension*'s per-principle series over the project's history window, newest first.

    Raises FileNotFoundError for a project with no directory and
    UnknownDimension when no run of the window scored *dimension*. A dimension
    the project's visible-standards selection hides answers no rows, as the
    project card leaves it out of the headline.
    """
    validate_path_segment(project, dimension)
    if not (reports_root / project).is_dir():
        raise FileNotFoundError(project)
    rows = ProjectRows.load(reports_root, project)
    series = _series_rows(rows, dimension)
    if not series:
        raise UnknownDimension(dimension)
    visible = load_project_standards(settings_reports_root(), project).visible_ids
    return PrincipleSeries(dimension, series if dimension.lower() in visible else [])


def _history_runs(runs: list[RunInfo]) -> list[RunInfo]:
    """The trend's history window without the running run, whose partial
    scores the client never lets represent a bucket (``isBucketEligible``)."""
    return [r for r in select_trend_runs(runs)[:max_history_runs()] if r.status is not RunState.RUNNING]


def _series_rows(rows: ProjectRows, dimension: str) -> list[PrincipleSeriesRun]:
    """One entry per history run that scored *dimension*, each graded principle
    with its counts; a run that skipped it has none (carry-over is the
    client's bucket rule, as for the trend)."""
    fetch = run_rows(rows.fetcher)
    out: list[PrincipleSeriesRun] = []
    for run in _history_runs(rows.runs):
        dim = next((d for d in fetch(run.run_id) if d.dimension == dimension), None)
        if dim is None:
            continue
        principles = [p for p in principles_with_counts(dim) if p.principle]
        out.append(PrincipleSeriesRun(run.run_id, run.date_iso, run.date_label, principles))
    return out
