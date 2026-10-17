"""Storage endpoints for Settings.

GET    /api/storage             -- size, runs, archived runs per project, the setting, clean progress
PUT    /api/storage/settings    -- {archiveAfterDays: 91|183|365|null}
GET    /api/storage/preview     -- what a clean would archive now, and about how much it frees
POST   /api/storage/clean       -- start "clean now" (202), 409 while a clean runs
DELETE /api/storage?confirm=true -- delete every project's evaluations, 409 while anything runs
"""
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timezone
from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response, jsonify, request

from quodeq.api._constants import CODE_INTERNAL_ERROR, QUERY_FLAG_TRUE
from quodeq.api.helpers import json_error, optional_json_object_or_error
from quodeq.api.routes_common import reports_dir
from quodeq.services.base import ActionProvider
from quodeq.services.storage_job import CleanJob
from quodeq.services.storage_report import StorageBusyError, clean_preview, delete_all_evaluations, storage_summary
from quodeq.services.storage_settings import StorageSettings, read_storage_settings, write_storage_settings
from quodeq.services.warmup import engine as warmup_engine
from quodeq.shared.log_sink import SHARED_LOG

CODE_INVALID_VALUE = "INVALID_VALUE"
CODE_STORAGE_BUSY = "STORAGE_BUSY"
CODE_CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED"
_SETTING_KEY = "archiveAfterDays"


def _busy(message: str) -> tuple[Response, int]:
    return json_error(message, HTTPStatus.CONFLICT, CODE_STORAGE_BUSY)


def _summary_payload(env: Mapping[str, str] | None, job: CleanJob) -> dict:
    summary = storage_summary(Path(reports_dir()))
    return {
        "bytes": summary.bytes, "runs": summary.runs, "archived": summary.archived,
        "projects": {p.project_id: {"bytes": p.bytes, "runs": p.runs, "archived": p.archived} for p in summary.projects},
        _SETTING_KEY: read_storage_settings(env).archive_after_days,
        "clean": job.snapshot(),
    }


def _put_settings(env: Mapping[str, str] | None) -> Response | tuple[Response, int]:
    body = optional_json_object_or_error(CODE_INVALID_VALUE)
    if not isinstance(body, dict):
        return body
    if _SETTING_KEY not in body:
        return json_error("archiveAfterDays is required", HTTPStatus.BAD_REQUEST, CODE_INVALID_VALUE)
    try:
        saved = write_storage_settings(StorageSettings(archive_after_days=body[_SETTING_KEY]), env, log=SHARED_LOG)
    except ValueError:
        return json_error(
            "archiveAfterDays must be 91, 183, 365 or null", HTTPStatus.BAD_REQUEST, CODE_INVALID_VALUE,
        )
    if not saved:
        return json_error("Could not save the storage settings", HTTPStatus.INTERNAL_SERVER_ERROR, CODE_INTERNAL_ERROR)
    return jsonify({_SETTING_KEY: body[_SETTING_KEY]})


def _delete_all(provider: ActionProvider) -> Response | tuple[Response, int]:
    if request.args.get("confirm") != QUERY_FLAG_TRUE:
        return json_error(
            "Use ?confirm=true to confirm deleting all evaluation data",
            HTTPStatus.BAD_REQUEST, CODE_CONFIRMATION_REQUIRED,
        )
    if (warmup_engine.snapshot() or {}).get("active"):
        return _busy("The score warm-up is running; try again when it ends")
    try:
        deleted = delete_all_evaluations(provider, Path(reports_dir()))
    except StorageBusyError:
        return _busy("An evaluation or a storage clean is running; try again when it ends")
    SHARED_LOG.info(f"delete all evaluations: removed {deleted} project folders")
    return jsonify({"deleted": deleted})


def register_storage_routes(app: Flask, provider: ActionProvider, env: Mapping[str, str] | None = None) -> None:
    """Register the storage endpoints; the clean job lives in ``app.extensions["storage_clean"]``."""
    job: CleanJob = app.extensions.setdefault("storage_clean", CleanJob())

    @app.get("/api/storage")
    def get_storage() -> Response:
        return jsonify(_summary_payload(env, job))

    @app.put("/api/storage/settings")
    def put_storage_settings() -> Response | tuple[Response, int]:
        return _put_settings(env)

    @app.get("/api/storage/preview")
    def get_storage_preview() -> Response:
        days = read_storage_settings(env).archive_after_days
        preview = clean_preview(Path(reports_dir()), datetime.now(timezone.utc), days)
        return jsonify({"archive": preview.archive, "frees": preview.frees})

    @app.post("/api/storage/clean")
    def post_storage_clean() -> tuple[Response, int]:
        if not job.start(reports_dir(), env, SHARED_LOG):
            return _busy("A storage clean is already running")
        return jsonify({"clean": job.snapshot()}), HTTPStatus.ACCEPTED

    @app.delete("/api/storage")
    def delete_storage() -> Response | tuple[Response, int]:
        return _delete_all(provider)
