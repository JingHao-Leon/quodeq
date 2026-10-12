"""GET /api/projects/<project>/map/history: per-run map data (files, areas, activity)."""
from __future__ import annotations

import logging
import sqlite3
from http import HTTPStatus

from flask import Flask, Response, request

from quodeq.api.map_history_payload import map_history_payload
from quodeq.api._report_payload import PayloadFailure, serve_report_payload
from quodeq.api.helpers import json_error, validate_segment
from quodeq.services.map_history import build_map_history

_logger = logging.getLogger(__name__)
_ROUTE = "/api/projects/<project>/map/history"
_FRAMES = ("latest", "all")


def register_map_history_routes(app: Flask) -> None:
    """Bind the map history route."""
    def map_history(project: str) -> Response | tuple[Response, int]:
        """The project's map history: the latest frame, or every frame with ``?frames=all``."""
        err = validate_segment(project)
        if err is not None:
            return err
        frames = request.args.get("frames", "latest")
        if frames not in _FRAMES:
            return json_error("frames must be 'latest' or 'all'", HTTPStatus.BAD_REQUEST, "BAD_REQUEST")
        failure = PayloadFailure(
            errors=(OSError, ValueError, sqlite3.Error), message="Failed to build the map history",
            log=lambda: _logger.exception("Failed to build the map history for %s", project))
        return serve_report_payload(
            lambda root: map_history_payload(build_map_history(root, project, frames=frames)), failure)

    app.get(_ROUTE)(map_history)
