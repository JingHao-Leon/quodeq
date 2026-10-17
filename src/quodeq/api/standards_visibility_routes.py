"""GET/PUT the per-project visible-standards selection.

The selection is kept on this machine, keyed by project id
(``~/.quodeq/projects/<id>/standards.json``), never inside the analyzed
repository, so the dashboard and the assistant both read one selection
(there is no CLI consumer). See core.standards.visibility.
"""
from __future__ import annotations

import logging
from pathlib import Path

from flask import Flask, Response, jsonify

from quodeq.api.helpers import optional_json_object_or_error
from quodeq.api.standards_project import invalid_body, invalid_payload, project_id_or_error
from quodeq.api.routes_common import standards_compiled_dir
from quodeq.core.standards.visibility import DEFAULT_VISIBLE_STANDARDS, validate_visible_ids
from quodeq.services.standards_prefs import (
    ProjectStandards,
    load_project_standards,
    save_enabled_ids,
)
from quodeq.services.standards import StandardsService

logger = logging.getLogger(__name__)


def _known_ids(app: Flask) -> set[str]:
    service = StandardsService(
        Path(app.config["STANDARDS_EVALUATORS_DIR"]),
        standards_compiled_dir(app),
        Path(app.config["STANDARDS_DIMENSIONS_FILE"]),
    )
    return {m.id.strip().lower() for m in service.list_standards()}


def _payload(app: Flask, settings: ProjectStandards, *, known_ids: set[str] | None = None) -> dict:
    return {
        "visibleStandardIds": list(settings.visible_ids),
        "isDefault": settings.is_default,
        "knownStandardIds": sorted(known_ids if known_ids is not None else _known_ids(app)),
        # Additive: lets the UI's boot-time JS literal (constants.js)
        # be reconciled against the server's own default set instead
        # of duplicating it as a second source of truth.
        "defaultStandardIds": list(DEFAULT_VISIBLE_STANDARDS),
    }


def register_visibility_routes(app: Flask) -> None:
    """Register GET/PUT endpoints for the per-project standards selection."""

    @app.get("/api/projects/<project_id>/standards-visibility")
    def get_standards_visibility(project_id: str) -> Response:
        reports_root, err = project_id_or_error(project_id)
        if err is not None:
            return err
        return jsonify(_payload(app, load_project_standards(reports_root, project_id)))

    @app.put("/api/projects/<project_id>/standards-visibility")
    def put_standards_visibility(project_id: str) -> Response:
        reports_root, err = project_id_or_error(project_id)
        if err is not None:
            return err
        body = optional_json_object_or_error(force=True)
        if not isinstance(body, dict):
            return body
        raw = body.get("visibleStandardIds") if isinstance(body, dict) else None
        if raw is None:
            return invalid_body('Body must be {"visibleStandardIds": [...]}')
        known = _known_ids(app)
        clean, errors = validate_visible_ids(raw, known)
        if errors:
            return invalid_payload("Invalid visibility selection", "invalid_visibility", errors)
        saved = save_enabled_ids(reports_root, project_id, clean)
        logger.info("standards.visibility saved project=%s visible=%d",
                    project_id, len(clean))
        return jsonify(_payload(app, saved, known_ids=known))
