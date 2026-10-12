"""Serve a JSON payload built from the reports directory, with the routes' shared error handling."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import Path

from flask import Response

from quodeq.api._http_cache import conditional_json
from quodeq.api.helpers import json_error
from quodeq.api.routes_common import reports_dir


@dataclass(frozen=True)
class PayloadFailure:
    """How a route reports a payload that could not be built."""

    errors: tuple[type[Exception], ...]  # the exceptions that mean "could not build", answered with a 500
    message: str  # the 500 body's error text
    log: Callable[[], None]  # logs the failure with its traceback (called inside the except block)
    not_found: str | None = None  # when set, a FileNotFoundError answers 404 with this text


def serve_report_payload(build: Callable[[Path], object], failure: PayloadFailure) -> Response | tuple[Response, int]:
    """``build(reports_dir)`` as a cacheable JSON response, or the route's 404/500 error."""
    try:
        payload = build(Path(reports_dir()))
    except failure.errors as exc:
        if failure.not_found is not None and isinstance(exc, FileNotFoundError):
            return json_error(failure.not_found, HTTPStatus.NOT_FOUND, "NOT_FOUND")
        failure.log()
        return json_error(failure.message, HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR")
    return conditional_json(payload, max_age=0)
