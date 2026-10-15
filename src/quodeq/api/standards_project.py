"""The guard and the two error shapes the per-project standards routes share.

``standards_visibility_routes`` and ``standards_overrides_routes`` both read
and write the per-project settings kept on this machine (never inside the
analyzed repository), so both validate a project id the same way and both
refuse a bad body and a rejected payload the same way. Those three live here
rather than once per route module.
"""
from __future__ import annotations

from http import HTTPStatus
from pathlib import Path
from typing import Any

from flask import Response, jsonify

from quodeq.api._constants import ERROR_CODE_BAD_REQUEST
from quodeq.api.helpers import error_response
from quodeq.shared.env_paths import get_evaluations_dir
from quodeq.shared.validation import validate_path_segment


def project_id_or_error(project_id: str) -> tuple[Path | None, Any]:
    """Validate *project_id*; return the evaluations root its settings resolve under.

    Settings live on this machine keyed by id, so a project with no local
    repository (online, shared) is still a valid target.
    """
    try:
        validate_path_segment(project_id)
    except ValueError:
        return None, error_response("Invalid project id", HTTPStatus.BAD_REQUEST, ERROR_CODE_BAD_REQUEST)
    return Path(get_evaluations_dir()), None


def invalid_body(message: str) -> Any:
    """A 400 naming the body shape the route expects."""
    return error_response(message, HTTPStatus.BAD_REQUEST, ERROR_CODE_BAD_REQUEST)


def invalid_payload(message: str, code: str, errors: list) -> Response:
    """A 400 carrying the per-entry *errors* the validator rejected.

    A jsonified Response rather than an ``error_response`` tuple: these
    routes return the ``details`` list alongside the message.
    """
    resp = jsonify({"error": message, "code": code, "details": errors})
    resp.status_code = HTTPStatus.BAD_REQUEST
    return resp
