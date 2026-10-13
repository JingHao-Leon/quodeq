"""Composition root for assistant actions: binds ActionContext ports to services.

``build_action_context`` reads the paths from ``app.config`` fresh on every
apply request (tests monkeypatch ``EVALUATIONS_DIR`` before POSTing and
expect that to take effect), then ``action_context_for`` wires the concrete
standards, dismissal, rescore and verification services behind the ports
``quodeq.assistant.tools.action_context.ActionContext`` declares.
"""
from __future__ import annotations

from pathlib import Path

from flask import Flask

from quodeq.api.routes_common import standards_compiled_dir
from quodeq.assistant.tools import ActionContext
from quodeq.services.dismissed import dismiss_finding
from quodeq.services.mutation_rescore import dismiss_delta, rescore_with_fallback
from quodeq.services.standards import IMPORT_STATUS_CONFLICT, StandardsService
from quodeq.services.verified import verify_finding
from quodeq.shared.env import get_evaluations_dir


def action_context_for(
    *, evaluations_dir: Path, evaluators_dir: Path, compiled_dir: Path, dimensions_file: Path,
) -> ActionContext:
    """The ActionContext whose ports write under these directories."""
    standards = StandardsService(evaluators_dir, compiled_dir, dimensions_file)

    def import_standard(standard: dict) -> dict | None:
        result = standards.import_from_file(standard, force=False)
        return None if result.get("status") == IMPORT_STATUS_CONFLICT else result

    return ActionContext(
        import_standard=import_standard,
        dismiss_finding=lambda project, finding, run_id: dismiss_finding(
            evaluations_dir / project, finding, run_id=run_id),
        rescore=lambda project, run_id: rescore_with_fallback(str(evaluations_dir), project, run_id),
        dismiss_delta=lambda project, run_id, finding: dismiss_delta(
            str(evaluations_dir), project, run_id, finding),
        verify_finding=lambda project, finding: verify_finding(evaluations_dir / project, finding),
    )


def build_action_context(app: Flask) -> ActionContext:
    """Build an ActionContext from app.config, resolved fresh per request."""
    return action_context_for(
        evaluations_dir=Path(app.config.get("EVALUATIONS_DIR") or get_evaluations_dir()),
        evaluators_dir=Path(app.config["STANDARDS_EVALUATORS_DIR"]),
        compiled_dir=standards_compiled_dir(app),
        dimensions_file=Path(app.config["STANDARDS_DIMENSIONS_FILE"]),
    )
