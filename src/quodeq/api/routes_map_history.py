"""GET /api/projects/<project>/map/history: per-run map data (files, areas, activity).

``?dimensions=a,b`` measures it over those dimensions' findings only, and
``&principle=P`` (with exactly one dimension) over that principle's; each area
then carries its lift. Without them it is every finding, as stored. A shared
project's history comes from ``/api/shared/projects/<project>/map/history``,
built the same way over the shared clone.
"""
from __future__ import annotations

import logging
import sqlite3
from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response, request
from werkzeug.datastructures import MultiDict

from quodeq.api.map_history_payload import map_history_payload
from quodeq.api._constants import CODE_INVALID_INPUT
from quodeq.api._report_payload import PayloadFailure, serve_report_payload
from quodeq.api.helpers import json_error, validate_segment
from quodeq.api.routes_shared_common import with_shared_root
from quodeq.core.map_history.selection import ALL_PRINCIPLES, FindingSelection, SelectionError
from quodeq.services.map_history import ALL_FRAMES, FRAME_CHOICES, LATEST_FRAMES, build_map_history

_logger = logging.getLogger(__name__)
_ROUTE = "/api/projects/<project>/map/history"
_SHARED_ROUTE = "/api/shared/projects/<project>/map/history"
_FRAMES_ERROR = f"frames must be {' or '.join(repr(f) for f in FRAME_CHOICES)}"
DIMENSIONS_ARG = "dimensions"
PRINCIPLE_ARG = "principle"
_DIMENSIONS_SEP = ","


def selection_from(args: MultiDict[str, str]) -> FindingSelection | None:
    """The finding selection the query *args* ask for, None when they name no dimension and no principle.

    Raises SelectionError for a principle without exactly one dimension.
    """
    parts = (d.strip() for d in args.get(DIMENSIONS_ARG, "").split(_DIMENSIONS_SEP))
    dimensions = frozenset(d for d in parts if d)
    principle = args.get(PRINCIPLE_ARG, ALL_PRINCIPLES).strip()
    if not dimensions and not principle:
        return None
    return FindingSelection(dimensions, principle)


def map_history_response(project: str, root: Path | None = None) -> Response | tuple[Response, int]:
    """The map history of *project* under *root* (the local reports directory by default), or its 400/500.

    The latest frame, or every frame with ``?frames=all``; optionally selected.
    """
    err = validate_segment(project)
    if err is not None:
        return err
    frames = request.args.get("frames", LATEST_FRAMES)
    if frames not in FRAME_CHOICES:
        return json_error(_FRAMES_ERROR, HTTPStatus.BAD_REQUEST, CODE_INVALID_INPUT)
    try:
        selection = selection_from(request.args)
    except SelectionError as exc:
        return json_error(exc.public_message, HTTPStatus.BAD_REQUEST, CODE_INVALID_INPUT)
    failure = PayloadFailure(
        errors=(OSError, ValueError, sqlite3.Error), message="Failed to build the map history",
        log=lambda: _logger.exception("Failed to build the map history for %s", project),
        bad_request=(SelectionError,))
    return serve_report_payload(
        lambda reports_root: map_history_payload(build_map_history(reports_root, project, frames=frames, selection=selection),
                                                 delta=frames == ALL_FRAMES),
        failure, root)


def map_history(project: str) -> Response | tuple[Response, int]:
    """The local project's map history."""
    return map_history_response(project)


@with_shared_root
def shared_map_history(project: str, eval_root: Path) -> Response | tuple[Response, int]:
    """The shared clone's map history, same shape as the local one."""
    return map_history_response(project, eval_root)


def register_map_history_routes(app: Flask) -> None:
    """Bind the local route."""
    app.get(_ROUTE)(map_history)


def register_shared_map_history_route(app: Flask) -> None:
    """Bind the read-only shared mirror; called with the other /api/shared/* mirrors."""
    app.get(_SHARED_ROUTE)(shared_map_history)
