"""RunConfig builder shared by the test_cache_writer* siblings."""
from __future__ import annotations

from pathlib import Path

from quodeq.analysis.run_types import AnalysisOptions, RunConfig


def _make_config(
    src: Path,
    *,
    work_dir: Path | None = None,
    standards_dir: Path | None = None,
    model: str = "sonnet",
    language: str = "kotlin",
    standards_settings: Path | None = None,
) -> RunConfig:
    opts = AnalysisOptions(subagent_model=model)
    return RunConfig(
        src=src,
        language=language,
        standards_dir=standards_dir,
        work_dir=work_dir or src,
        options=opts,
        standards_settings=standards_settings,
    )


def _write_settings(tmp_path: Path, overrides_json: str) -> Path:
    """Write a project's machine settings file carrying *overrides_json*."""
    path = tmp_path / "home" / "projects" / "p" / "standards.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"version": 2, "overrides": ' + overrides_json + "}")
    return path
