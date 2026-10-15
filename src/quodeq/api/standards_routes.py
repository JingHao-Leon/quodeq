"""API routes for the Standards Browser & Editor.

Entry point that delegates to focused sub-modules:
- standards_read_routes: GET / list / detail endpoints
- standards_import_routes: import from file
- standards_crud_routes: create, update, delete, duplicate
"""
from __future__ import annotations

from pathlib import Path

from flask import Flask

from quodeq.api.standards_crud_routes import register_crud_routes
from quodeq.api.standards_import_routes import register_import_routes
from quodeq.api.standards_overrides_routes import register_overrides_routes
from quodeq.api.standards_read_routes import register_read_routes
from quodeq.api.standards_visibility_routes import register_visibility_routes
from quodeq.api.routes_common import standards_compiled_dir
from quodeq.services.standards import StandardsService, shared_standards_provider


def _get_service(app: Flask) -> StandardsService:
    """Return the lazily-initialized StandardsService for this Flask app.

    Lifecycle: the ``_standards_service`` attribute is created on first
    request and reused for the lifetime of the Flask app.  Tests can
    pre-set ``app._standards_service`` before any route runs to inject a
    mock or stub, bypassing the real filesystem entirely.
    """
    if not hasattr(app, "_standards_service"):
        app._standards_service = StandardsService(
            evaluators_dir=Path(app.config["STANDARDS_EVALUATORS_DIR"]),
            compiled_dir=standards_compiled_dir(app),
            dimensions_file=Path(app.config["STANDARDS_DIMENSIONS_FILE"]),
            shared_standards=shared_standards_provider(),
        )
    return app._standards_service


def register_standards_routes(app: Flask) -> None:
    """Bind every /api/standards/* route: reads, imports, CRUD, overrides, visibility.

    The service is passed as a factory so each request
    resolves it against the current app config rather than import-time state.
    """
    register_read_routes(app, _get_service)
    register_import_routes(app, _get_service)
    register_crud_routes(app, _get_service)
    register_overrides_routes(app)
    register_visibility_routes(app)
