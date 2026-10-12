"""GET /api/projects/<project>/map/history: per-run map data (files, areas, activity)."""
from __future__ import annotations

import logging
import sqlite3
from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response, request

from quodeq.api._http_cache import conditional_json
from quodeq.api.helpers import json_error, validate_segment
from quodeq.api.routes_common import reports_dir
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
        try:
            payload = build_map_history(Path(reports_dir()), project, frames=frames)
        except (OSError, ValueError, sqlite3.Error):
            _logger.exception("Failed to build the map history for %s", project)
            return json_error("Failed to build the map history", HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR")
        return conditional_json(payload, max_age=0)

    app.get(_ROUTE)(map_history)
