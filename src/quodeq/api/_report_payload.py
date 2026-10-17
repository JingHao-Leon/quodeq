"""Serve a JSON payload built from the reports directory, with the routes' shared error handling."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import Path

from flask import Response

from quodeq.api._constants import CODE_INVALID_INPUT
from quodeq.api._http_cache import conditional_json
from quodeq.api.helpers import json_error
from quodeq.api.routes_common import reports_dir

_BAD_REQUEST = "Bad request"


@dataclass(frozen=True)
class PayloadFailure:
    """How a route reports a payload that could not be built."""

    errors: tuple[type[Exception], ...]  # the exceptions that mean "could not build", answered with a 500
    message: str  # the 500 body's error text
    log: Callable[[], None]  # logs the failure with its traceback (called inside the except block)
    not_found: str | None = None  # when set, a FileNotFoundError answers 404 with this text
    # the exceptions that mean a bad request, answered 400 with their ``public_message`` (a fixed text without one)
    bad_request: tuple[type[Exception], ...] = ()


def serve_report_payload(build: Callable[[Path], object], failure: PayloadFailure,
                         root: Path | None = None) -> Response | tuple[Response, int]:
    """``build(root)`` as a cacheable JSON response, or the route's 400/404/500 error.

    *root* defaults to the local reports directory; a shared mirror passes the shared clone's.
    """
    try:
        payload = build(root if root is not None else Path(reports_dir()))
    except failure.bad_request as exc:
        return json_error(getattr(exc, "public_message", _BAD_REQUEST), HTTPStatus.BAD_REQUEST, CODE_INVALID_INPUT)
    except failure.errors as exc:
        if failure.not_found is not None and isinstance(exc, FileNotFoundError):
            return json_error(failure.not_found, HTTPStatus.NOT_FOUND, "NOT_FOUND")
        failure.log()
        return json_error(failure.message, HTTPStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR")
    return conditional_json(payload, max_age=0)
