"""Share, install and update routes for custom standards (shared repository)."""
from __future__ import annotations

import logging
from collections.abc import Callable
from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response, jsonify

from quodeq.api._constants import ERROR_CODE_BAD_REQUEST
from quodeq.api.helpers import error_response, optional_json_object_or_error
from quodeq.services.shared_settings import read_settings
from quodeq.services.standards_share_ops import (
    ShareError,
    install_standard,
    share_standard,
    update_from_shared,
)
from quodeq.shared.validation import validate_path_segment

logger = logging.getLogger(__name__)

ERROR_CODE_NOT_CONNECTED = "shared_repo_not_connected"

_STATUS_BY_CODE = {
    "not_found": HTTPStatus.NOT_FOUND,
    "conflict": HTTPStatus.CONFLICT,
    "unsafe": HTTPStatus.UNPROCESSABLE_ENTITY,
    "invalid": HTTPStatus.BAD_REQUEST,
    "git": HTTPStatus.BAD_GATEWAY,
    "builtin": HTTPStatus.FORBIDDEN,
}


def shared_url() -> str | None:
    """The connected shared repository URL, or None when not connected."""
    return read_settings().url


_FORCEABLE = frozenset({"share", "update"})


def _force_kw(name: str) -> dict | tuple:
    """``{"force": bool}`` from the optional JSON body for the ops that take it, or a 400 tuple."""
    if name not in _FORCEABLE:
        return {}
    body = optional_json_object_or_error()
    if isinstance(body, tuple):
        return body
    return {"force": body.get("force") is True}


def _run(app: Flask, get_service, name: str, op: Callable[..., dict], standard_id: str):
    try:
        validate_path_segment(standard_id)
    except ValueError:
        return error_response("Invalid standard id", HTTPStatus.BAD_REQUEST, ERROR_CODE_BAD_REQUEST)
    url = shared_url()
    if not url:
        return error_response("Connect a shared repository first.", HTTPStatus.CONFLICT, ERROR_CODE_NOT_CONNECTED)
    extra = _force_kw(name)
    if isinstance(extra, tuple):
        return extra
    logger.info("standards.share op=%s id=%s", name, standard_id)
    try:
        result = op(standard_id, url=url, evaluators_dir=Path(app.config["STANDARDS_EVALUATORS_DIR"]),
                    is_builtin=get_service(app).is_builtin, **extra)
    except ShareError as exc:
        status = _STATUS_BY_CODE.get(exc.code, HTTPStatus.BAD_GATEWAY)
        return error_response(exc.message, status, exc.code)
    return result


def register_share_routes(app: Flask, get_service) -> None:
    """Bind POST /api/standards/<id>/{share,install,update}; share and update take ``{"force": true}``."""
    def bind(name: str, op: Callable[..., dict]) -> None:
        def view(standard_id: str) -> tuple[Response, int]:
            out = _run(app, get_service, name, op, standard_id)
            if isinstance(out, tuple):
                body, status = out
                return jsonify(body), status
            return jsonify(out), HTTPStatus.OK
        app.add_url_rule(f"/api/standards/<standard_id>/{name}", f"standards_{name}", view, methods=["POST"])

    # The ops are looked up when a request arrives, so a test can swap them.
    bind("share", lambda *a, **kw: share_standard(*a, **kw))
    bind("install", lambda *a, **kw: install_standard(*a, **kw))
    bind("update", lambda *a, **kw: update_from_shared(*a, **kw))
