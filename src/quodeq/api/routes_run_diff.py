"""GET /api/projects/<project>/runs/<run_id>/diff: one run classified against another."""
from __future__ import annotations

import logging

from flask import Flask, Response, request

from quodeq.api._report_payload import PayloadFailure, serve_report_payload
from quodeq.api.helpers import validate_segment
from quodeq.services.run_diff import diff_runs

_logger = logging.getLogger(__name__)
_QUERY_AGAINST = "against"
_ROUTE = "/api/projects/<project>/runs/<run_id>/diff"


def run_diff(project: str, run_id: str) -> Response | tuple[Response, int]:
    """Diff *run_id* against ``?against=`` or, by default, the previous terminal run."""
    against = request.args.get(_QUERY_AGAINST) or None
    for segment in (project, run_id, *([against] if against else [])):
        err = validate_segment(segment)
        if err is not None:
            return err
    # OSError/ValueError: a report that cannot be read, or a status.json state the parser rejects.
    failure = PayloadFailure(
        errors=(OSError, ValueError), message="Failed to diff runs", not_found="Run not found",
        log=lambda: _logger.exception("Failed to diff run %s for %s", run_id, project))
    return serve_report_payload(lambda root: diff_runs(root, project, run_id, against), failure)


def register_run_diff_routes(app: Flask) -> None:
    """Bind the run-diff route."""
    app.get(_ROUTE)(run_diff)
