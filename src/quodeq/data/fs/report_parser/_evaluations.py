"""Evaluation loading from run directories."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from quodeq.data.fs.report_parser._run_info import safe_read_dir
from quodeq.data.fs.report_parser.json_parser import parse_report_json
from quodeq.data.fs.report_files import list_report_files


def _load_markdown_backed_evals(
    entries: list[os.DirEntry[str]], reports: dict[str, Path],
) -> tuple[list[dict[str, Any]], set[str]]:
    """Load evaluations for dimensions that have a companion _eval.md file."""
    evaluations: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in entries:
        if not entry.is_file() or not entry.name.endswith("_eval.md"):
            continue
        dimension = entry.name.removesuffix("_eval.md")
        parsed = parse_report_json(reports[dimension]) if dimension in reports else None
        if parsed:
            evaluations.append(parsed)
            seen.add(dimension)
    return evaluations, seen


def _load_json_only_evals(reports: dict[str, Path], seen: set[str]) -> list[dict[str, Any]]:
    """Load evaluations from the report files (plain or packed) not already covered by the markdown-backed pass."""
    evaluations: list[dict[str, Any]] = []
    for dimension, path in reports.items():
        if dimension in seen:
            continue
        parsed = parse_report_json(path)
        if parsed:
            evaluations.append(parsed)
    return evaluations


def load_evaluations(evaluation_dir: Path) -> list[dict[str, Any]]:
    """Load parsed evaluation dicts from a run's evaluation directory.

    Supports both flat layouts (single-target) and nested layouts (multi-target)
    where each subdirectory is a target module.
    """
    entries = safe_read_dir(evaluation_dir)
    reports = dict(list_report_files(evaluation_dir))
    evaluations, seen = _load_markdown_backed_evals(entries, reports)
    evaluations.extend(_load_json_only_evals(reports, seen))

    # Scan target subdirectories for multi-target runs
    for entry in entries:
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        target_dir = evaluation_dir / entry.name
        sub_entries = safe_read_dir(target_dir)
        sub_reports = dict(list_report_files(target_dir))
        sub_evals, sub_seen = _load_markdown_backed_evals(sub_entries, sub_reports)
        for ev in sub_evals:
            ev.setdefault("module", entry.name)
        evaluations.extend(sub_evals)
        json_evals = _load_json_only_evals(sub_reports, sub_seen)
        for ev in json_evals:
            ev.setdefault("module", entry.name)
        evaluations.extend(json_evals)

    return evaluations
