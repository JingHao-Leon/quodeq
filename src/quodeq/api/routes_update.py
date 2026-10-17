"""/api/update/* routes: update status, manual check, dismiss, settings, self-update and in-place upgrade."""

from __future__ import annotations

from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response, jsonify

from quodeq.api._constants import CODE_FORBIDDEN, CODE_MISSING_PARAM
from quodeq.api.helpers import json_error, optional_json_object_or_response
from quodeq.api.routes_common import is_local_request
from quodeq.services.running_evaluations import running_evaluations
from quodeq.shared.env import get_evaluations_dir
from quodeq.update import inplace
from quodeq.update.checker import (
    begin_in_place_upgrade,
    begin_self_update,
    check_async,
    dismiss,
    get_status,
    run_check,
    set_settings,
)


_REASON_REMOTE = "remote"  # only the machine running quodeq may upgrade it
_CODE_EVALUATIONS_RUNNING = "EVALUATIONS_RUNNING"
_CODE_NOT_UPGRADED = "NOT_UPGRADED"


def _evaluations_running() -> int:
    return len(running_evaluations(Path(get_evaluations_dir())))


def _status() -> dict:
    """``get_status`` plus the facts only the API knows: who asks, and what is running.

    An upgrade replaces the code running evaluations still load, so the UI
    holds the Install button while any run.
    """
    status = dict(get_status())
    in_place = dict(status.get("in_place_upgrade") or {})
    if in_place.get("supported") and not is_local_request():
        in_place.update(supported=False, reason=_REASON_REMOTE)
    in_place["evaluations_running"] = _evaluations_running() if in_place.get("supported") else 0
    status["in_place_upgrade"] = in_place
    return status


def _begin_response(result: dict) -> Response | tuple[Response, int]:
    """The wire form of a ``begin_*`` result: the fresh status, or 409 with its code."""
    if result["ok"]:
        return jsonify({"ok": True, "status": _status()})
    body = {"error": result["error"], "code": result["code"]}
    if "reason" in result:
        body["reason"] = result["reason"]
    return jsonify(body), HTTPStatus.CONFLICT


def _upgrade_start_response() -> Response | tuple[Response, int]:
    if not is_local_request():
        return json_error("only this machine can upgrade quodeq", HTTPStatus.FORBIDDEN, CODE_FORBIDDEN)
    if _evaluations_running():
        return json_error(
            "finish or cancel the running evaluations first",
            HTTPStatus.CONFLICT, _CODE_EVALUATIONS_RUNNING,
        )
    return _begin_response(begin_in_place_upgrade())


def _restart_response() -> Response | tuple[Response, int]:
    if not is_local_request():
        return json_error("only this machine can restart quodeq", HTTPStatus.FORBIDDEN, CODE_FORBIDDEN)
    if not inplace.restart():
        return json_error("nothing was upgraded", HTTPStatus.CONFLICT, _CODE_NOT_UPGRADED)
    return jsonify({"ok": True})


def _selfupdate_start_response() -> Response | tuple[Response, int]:
    if not is_local_request():
        return json_error("only this machine can update quodeq", HTTPStatus.FORBIDDEN, CODE_FORBIDDEN)
    return _begin_response(begin_self_update())


def register_update_routes(app: Flask) -> None:
    """Register the /api/update/* endpoints."""

    @app.get("/api/update/status")
    def update_status() -> Response:
        check_async()  # throttled + non-blocking; refreshes state for next time
        return jsonify(_status())

    @app.post("/api/update/check")
    def update_check() -> Response:
        run_check(force=True)
        return jsonify(_status())

    @app.post("/api/update/dismiss")
    def update_dismiss() -> Response | tuple[Response, int]:
        body = optional_json_object_or_response(CODE_MISSING_PARAM)
        if not isinstance(body, dict):
            return body
        version = body.get("version")
        if not version:
            return json_error("version is required", HTTPStatus.BAD_REQUEST, CODE_MISSING_PARAM)
        dismiss(version)
        return jsonify({"ok": True, "status": _status()})

    @app.post("/api/update/selfupdate")
    def update_selfupdate() -> Response | tuple[Response, int]:
        return _selfupdate_start_response()

    @app.post("/api/update/upgrade")
    def update_upgrade() -> Response | tuple[Response, int]:
        return _upgrade_start_response()

    @app.post("/api/update/restart")
    def update_restart() -> Response | tuple[Response, int]:
        return _restart_response()

    @app.post("/api/update/settings")
    def update_settings() -> Response | tuple[Response, int]:
        body = optional_json_object_or_response(CODE_MISSING_PARAM)
        if not isinstance(body, dict):
            return body
        set_settings(
            auto_check_enabled=body.get("auto_check_enabled"),
            disclosed=body.get("disclosed"),
        )
        return jsonify({"ok": True, "status": _status()})
