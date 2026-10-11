"""GET /api/projects/<project>/runs/log: the History run log for one project."""
from __future__ import annotations

import logging
import sqlite3
from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response

from quodeq.api._http_cache import conditional_json
from quodeq.api.helpers import json_error, validate_segment
from quodeq.api.routes_common import reports_dir
from quodeq.services.run_log import RunChangeFiller, RunLister, build_run_log
from quodeq.shared.log_sink import SHARED_LOG

_logger = logging.getLogger(__name__)
_ROUTE = "/api/projects/<project>/runs/log"
_FILLER_KEY = "run_change_filler"


def register_run_log_routes(app: Flask, provider: RunLister) -> None:
    """Bind the run-log route; one change filler is shared by every request of this app."""
    filler = app.extensions.setdefault(_FILLER_KEY, RunChangeFiller(log=SHARED_LOG))

    def run_log(project: str) -> Response | tuple[Response, int]:
        """The project's scored runs, newest first, plus the running job."""
        err = validate_segment(project)
        if err is not None:
            return err
        try:
            payload = build_run_log(Path(reports_dir()), project, provider=provider, filler=filler)
        except (OSError, ValueError, sqlite3.Error):
            _logger.exception("Failed to build the run log for %s", project)
            return json_error("Failed to build the run log", HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR")
        return conditional_json(payload, max_age=0)

    app.get(_ROUTE)(run_log)
