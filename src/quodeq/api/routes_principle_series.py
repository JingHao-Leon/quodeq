"""GET .../dimensions/<dimension>/principle-series: one dimension's per-principle score series.

Fetched on demand by the dimension and principle pages, so the trend rows the
Overview reads stay free of principles. The shared-project mirror serves the
same payload from the shared clone (``with_shared_root`` scopes the score
cache to it), like the other read mirrors.
"""
from __future__ import annotations

import logging
import sqlite3
from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response

from quodeq.api._constants import CODE_INTERNAL_ERROR, CODE_NOT_FOUND
from quodeq.api._http_cache import conditional_json
from quodeq.api.helpers import json_error, validate_segment
from quodeq.api.routes_common import reports_dir
from quodeq.api.routes_shared_common import with_shared_root
from quodeq.services.principle_series import UnknownDimension, build_principle_series

_logger = logging.getLogger(__name__)
_ROUTE = "/api/projects/<project>/dimensions/<dimension>/principle-series"
_SHARED_ROUTE = "/api/shared/projects/<project>/dimensions/<dimension>/principle-series"
_PROJECT_NOT_FOUND = "Project not found"
_FAILED = "Failed to build the principle series"


def principle_series_response(root: Path, project: str, dimension: str) -> Response | tuple[Response, int]:
    """The series of *dimension* under *root* as a cacheable JSON response, or its 404/500."""
    err = validate_segment(project, dimension)
    if err is not None:
        return err
    try:
        payload = build_principle_series(root, project, dimension)
    except UnknownDimension as exc:
        return json_error(exc.public_message, HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
    except FileNotFoundError:
        return json_error(_PROJECT_NOT_FOUND, HTTPStatus.NOT_FOUND, CODE_NOT_FOUND)
    except (OSError, ValueError, sqlite3.Error):
        _logger.exception("Failed to build the %s principle series for %s", dimension, project)
        return json_error(_FAILED, HTTPStatus.INTERNAL_SERVER_ERROR, CODE_INTERNAL_ERROR)
    return conditional_json(payload, max_age=0)


def principle_series(project: str, dimension: str) -> Response | tuple[Response, int]:
    """The local project's series."""
    return principle_series_response(Path(reports_dir()), project, dimension)


@with_shared_root
def shared_principle_series(project: str, dimension: str, eval_root: Path) -> Response | tuple[Response, int]:
    """The shared clone's series, same shape as the local one."""
    return principle_series_response(eval_root, project, dimension)


def register_principle_series_routes(app: Flask) -> None:
    """Bind the local route."""
    app.get(_ROUTE)(principle_series)


def register_shared_principle_series_route(app: Flask) -> None:
    """Bind the read-only shared mirror; called with the other /api/shared/* mirrors."""
    app.get(_SHARED_ROUTE)(shared_principle_series)
