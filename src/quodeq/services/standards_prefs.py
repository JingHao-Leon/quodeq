"""Standards visibility/overrides persistence for delivery layers.

The API layer does not import ``data/`` directly (see ARCHITECTURE.md import
rules); this facade exposes the per-project standards preference store
through services. Pure validation/partitioning stays importable from
``core/standards/``.
"""
from quodeq.data.fs.compiled_standards import (  # noqa: F401 — re-exported API
    iter_compiled_standards,
)
from quodeq.data.fs.standards_prefs import (  # noqa: F401 — re-exported API
    ProjectStandards,
    collect_requirement_ids,
    collect_declared_params,
    load_project_standards,
    project_settings_file,
    save_enabled_ids,
    save_overrides,
    settings_reports_root,
)
