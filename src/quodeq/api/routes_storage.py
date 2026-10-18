"""Storage endpoints for Settings.

GET    /api/storage             -- size, runs, archived runs per project, the settings, the first-start notice, clean progress
PUT    /api/storage/settings    -- {archiveAfterDays?: 91|183|365|null, autoCleanup?: bool}, at least one
GET    /api/storage/preview     -- what a clean would archive now, and about how much it frees
GET    /api/storage/clean       -- clean progress only, no disk walk (cheap to poll)
POST   /api/storage/clean       -- start "clean now" (202), 409 while a clean (STORAGE_BUSY), the score warm-up
                                   (STORAGE_WARMUP) or a grade-formula rescore (STORAGE_RESCORE) runs
DELETE /api/storage?confirm=true -- delete every project's evaluations, 409 while a run, a clean, the warm-up or a rescore runs

``archiveNotice`` is ``{runs, bytes}`` while the first start held the archive
back (see ``services/storage_notice``), else null.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from datetime import datetime, timezone
from http import HTTPStatus
from pathlib import Path

from flask import Flask, Response, jsonify, request

from quodeq.api._constants import CODE_INTERNAL_ERROR, QUERY_FLAG_TRUE
from quodeq.api.helpers import json_error, optional_json_object_or_error
from quodeq.api.routes_common import reports_dir
from quodeq.services.base import ActionProvider
from quodeq.services.storage_job import CleanJob
from quodeq.services.storage_cleanup import cleanup_enabled
from quodeq.services.storage_notice import mark_archive_notice_done
from quodeq.services.storage_report import (
    StorageBusyError, clean_preview, delete_all_evaluations, next_start_archive, storage_summary,
)
from quodeq.services.storage_settings import read_storage_settings, write_storage_settings
from quodeq.services.warmup import engine as warmup_engine
from quodeq.shared.env_resolve import resolve_env
from quodeq.shared.log_sink import SHARED_LOG

CODE_INVALID_VALUE = "INVALID_VALUE"
CODE_STORAGE_BUSY = "STORAGE_BUSY"
CODE_STORAGE_WARMUP = "STORAGE_WARMUP"
CODE_STORAGE_RESCORE = "STORAGE_RESCORE"
CODE_CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED"
_SETTING_KEY = "archiveAfterDays"
_AUTO_KEY = "autoCleanup"
_WARMUP_BUSY = "The score warm-up is running; try again when it ends"
_RESCORE_BUSY = "Runs are being rescored with the grade formula; try again when it ends"


def _busy(
    message: str, projects: tuple[str, ...] = (), code: str = CODE_STORAGE_BUSY,
) -> tuple[Response, int]:
    return jsonify({"error": message, "code": code, "projects": list(projects)}), HTTPStatus.CONFLICT


def _warmup_active() -> bool:
    return bool((warmup_engine.snapshot() or {}).get("active"))


def _summary_payload(env: Mapping[str, str] | None, job: CleanJob) -> dict:
    root = Path(reports_dir())
    summary = storage_summary(root)
    settings = read_storage_settings(env)
    notice = next_start_archive(
        root, datetime.now(timezone.utc), settings, cleanup_on=cleanup_enabled(resolve_env(env)),
    )
    return {
        "bytes": summary.bytes, "runs": summary.runs, "archived": summary.archived,
        "projects": {p.project_id: {"bytes": p.bytes, "runs": p.runs, "archived": p.archived} for p in summary.projects},
        _SETTING_KEY: settings.archive_after_days,
        _AUTO_KEY: settings.auto_cleanup,
        "archiveNotice": {"runs": notice.archive, "bytes": notice.frees} if notice else None,
        "clean": job.snapshot(),
    }


def _put_settings(env: Mapping[str, str] | None) -> Response | tuple[Response, int]:
    body = optional_json_object_or_error(CODE_INVALID_VALUE)
    if not isinstance(body, dict):
        return body
    if _SETTING_KEY not in body and _AUTO_KEY not in body:
        return json_error("archiveAfterDays or autoCleanup is required", HTTPStatus.BAD_REQUEST, CODE_INVALID_VALUE)
    current = read_storage_settings(env)
    changes = {
        "archive_after_days": body.get(_SETTING_KEY, current.archive_after_days),
        "auto_cleanup": body.get(_AUTO_KEY, current.auto_cleanup),
    }
    try:
        saved = write_storage_settings(replace(current, **changes), env, log=SHARED_LOG)
    except ValueError:
        return json_error(
            "archiveAfterDays must be 91, 183, 365 or null, autoCleanup true or false",
            HTTPStatus.BAD_REQUEST, CODE_INVALID_VALUE,
        )
    if not saved:
        return json_error("Could not save the storage settings", HTTPStatus.INTERNAL_SERVER_ERROR, CODE_INTERNAL_ERROR)
    return jsonify({_SETTING_KEY: changes["archive_after_days"], _AUTO_KEY: changes["auto_cleanup"]})


def _rescore_busy(app: Flask) -> bool:
    """A grade-formula rescore runs or waits to run: it restores archived runs, so no clean overlaps it."""
    rescorer = app.extensions.get("grade_formula_rescore")
    return rescorer is not None and rescorer.owes_pass()


def _delete_all(app: Flask, provider: ActionProvider) -> Response | tuple[Response, int]:
    if request.args.get("confirm") != QUERY_FLAG_TRUE:
        return json_error(
            "Use ?confirm=true to confirm deleting all evaluation data",
            HTTPStatus.BAD_REQUEST, CODE_CONFIRMATION_REQUIRED,
        )
    if _warmup_active():
        return _busy(_WARMUP_BUSY, code=CODE_STORAGE_WARMUP)
    if _rescore_busy(app):
        return _busy(_RESCORE_BUSY, code=CODE_STORAGE_RESCORE)
    try:
        deleted = delete_all_evaluations(provider, Path(reports_dir()))
    except StorageBusyError as exc:
        return _busy("An evaluation or a storage clean is running; try again when it ends", exc.projects)
    SHARED_LOG.info(f"delete all evaluations: removed {deleted} project folders")
    return jsonify({"deleted": deleted})


def register_storage_routes(app: Flask, provider: ActionProvider, env: Mapping[str, str] | None = None) -> None:
    """Register the storage endpoints; the clean job lives in ``app.extensions["storage_clean"]``."""
    job: CleanJob = app.extensions.setdefault(
        "storage_clean", CleanJob(rescore_busy=lambda: _rescore_busy(app), warmup_active=_warmup_active),
    )

    @app.get("/api/storage")
    def get_storage() -> Response:
        return jsonify(_summary_payload(env, job))

    @app.put("/api/storage/settings")
    def put_storage_settings() -> Response | tuple[Response, int]:
        return _put_settings(env)

    @app.get("/api/storage/preview")
    def get_storage_preview() -> Response:
        keep = read_storage_settings(env).keep_runs
        preview = clean_preview(Path(reports_dir()), datetime.now(timezone.utc), keep)
        return jsonify({"archive": preview.archive, "frees": preview.frees})

    @app.get("/api/storage/clean")
    def get_storage_clean() -> Response:
        return jsonify({"clean": job.snapshot()})

    @app.post("/api/storage/clean")
    def post_storage_clean() -> tuple[Response, int]:
        if _warmup_active():
            return _busy(_WARMUP_BUSY, code=CODE_STORAGE_WARMUP)
        if _rescore_busy(app):
            return _busy(_RESCORE_BUSY, code=CODE_STORAGE_RESCORE)
        if not job.start(reports_dir(), env, SHARED_LOG):
            return _busy("A storage clean is already running")
        mark_archive_notice_done(env, SHARED_LOG)  # this pass archives as set: the notice has done its job
        return jsonify({"clean": job.snapshot()}), HTTPStatus.ACCEPTED

    @app.delete("/api/storage")
    def delete_storage() -> Response | tuple[Response, int]:
        return _delete_all(app, provider)
