"""Violation shaping and paging for the read tools: trimming to the
model-facing shape, principle/requirement/severity normalization across the
run-scoped and accumulated payload shapes, hidden-standard filtering, folder
and file narrowing, and get_violations' scope routing.
"""
from __future__ import annotations

import heapq

from quodeq.assistant.tools._context import ToolContext
from quodeq.assistant.tools._read_tools_common import (
    find_dimension,
    raw_run_dims,
    requirement_of,
    validate_dimension,
)
from quodeq.assistant.tools._read_tools_scope import (
    accumulated_dims,
    has_run,
    no_scope_error,
    scored_run_dims,
)
from quodeq.assistant.tools.registry import ToolError
from quodeq.core.standards.visibility import (
    hidden_ids_for_names,
    partition_entries_visible,
    partition_visible,
)
from quodeq.core.types.severity import Severity
from quodeq.services.wiring import read_eval_report
from quodeq.core.utils.numbers import clamp

# Trimmed violation shape shared by get_report and get_violations. We keep only
# the fields that let the model locate and explain an issue and DROP the large
# `snippet`/`context` blobs so a report full of violations stays within a sane
# context budget. Use search_findings when the model needs the code snippet.
VIOLATION_FIELDS = ("principle", "file", "line", "severity", "title", "reason")
# get_violations paging limits.
_VIOLATIONS_DEFAULT_LIMIT = 40
VIOLATIONS_MAX_LIMIT = 100
# by_file keeps only the worst offenders so a project-wide page stays small.
_BY_FILE_TOP_N = 15
# Severity ordering (critical/major first). Unknown severities sort last.
# The Severity members are the canonical keys; the rest are synonyms models
# and older reports use for the same rungs.
_SEVERITY_RANK = {
    Severity.CRITICAL: 0, "blocker": 0, "high": 1, Severity.MAJOR: 1,
    "moderate": 2, "medium": 2, Severity.MINOR: 3, "low": 3, "info": 4, "trivial": 4,
}
# Sort rank for a severity string outside _SEVERITY_RANK: worse (sorts last)
# than any real rung, so an unrecognized severity never hides among sorted ones.
_UNKNOWN_SEVERITY_RANK = 99


def available_names(ctx: ToolContext, dims: list[dict]) -> str:
    """Comma-joined visible dimension names for a not-found error message.

    Filtered so an error never discloses a dimension the user has hidden.
    """
    names = [d.get("dimension") for d in dims if d.get("dimension")]
    shown, _ = partition_visible(names, ctx.visible_standard_ids)
    return ", ".join(sorted(shown))


def accumulated_dimension(
    ctx: ToolContext, dims: list[dict], dimension: str, *, hint: str = "",
) -> dict:
    """The accumulated entry for *dimension*; a ToolError listing the visible ones when absent.

    *hint* is appended to the error to point the model at another tool.
    """
    entry = find_dimension(dims, dimension)
    if entry is None:
        avail = available_names(ctx, dims)
        raise ToolError(f"no report for dimension: {dimension}. Available: {avail or '(none)'}{hint}")
    return entry


def hidden_ids(ctx: ToolContext, names: list[str]) -> list[str]:
    """Which of *names* the user has hidden. See ``hidden_ids_for_names``."""
    return hidden_ids_for_names(names, ctx.visible_standard_ids)


def visible_only(ctx: ToolContext, entries: list[dict],
                  key: str = "dimension") -> tuple[list[dict], list[str]]:
    """Drop entries whose dimension the user has hidden.

    Thin per-context wrapper around ``partition_entries_visible`` -- the one
    shared implementation used by every read surface, including
    ``_overview.get_overview``, so "what counts as hidden" cannot drift
    between them.
    """
    return partition_entries_visible(entries, ctx.visible_standard_ids, key=key)


def _principle_of(v: dict):
    # Run-scoped eval JSON keys the principle as "principle"; the accumulated
    # payload (serialized Finding) keys it as "practiceId". Accept either so
    # one trim/sort works for both scopes.
    return v.get("principle") or v.get("practiceId")


def trim_violation(v: dict) -> dict:
    """Reduce a raw violation to VIOLATION_FIELDS plus principle and requirement."""
    out = {k: v.get(k) for k in VIOLATION_FIELDS}
    out["principle"] = _principle_of(v)
    # Expose the requirement id so the model can form a correct dismiss/verify
    # key. Without it, get_report/get_violations only surfaced `principle`, and
    # a dismiss drafted from that data carried a wrong/empty req that never
    # matched the finding on the suppression read path (silent no-op).
    out["requirement"] = requirement_of(v)
    return out


def _severity_key(v: dict):
    sev = (v.get("severity") or "").lower()
    return (_SEVERITY_RANK.get(sev, _UNKNOWN_SEVERITY_RANK), _principle_of(v) or "")


def _normalize_path(path: str) -> str:
    """A repo-relative folder or file path with the separators the finding
    files use: forward slashes, no leading ``./`` or ``/``, no trailing ``/``."""
    out = str(path).replace("\\", "/").strip()
    while out.startswith("./"):
        out = out[2:]
    return out.strip("/")


def path_matches(file: str | None, path: str) -> bool:
    """Whether *file* lies under or is *path*, compared on whole segments.

    The match is anchored on segment boundaries but not on the repo root, so
    ``feature-component-tracking``, ``feature-component-tracking/src`` and
    ``TrackingDelegate.kt`` all select what a user pointing at that folder or
    file in the Map or Explorer means, while ``tracking`` never matches
    ``feature-component-tracking``.
    """
    if not file:
        return False
    haystack = f"/{_normalize_path(file)}/"
    return f"/{path}/" in haystack


def _count_by(raw: list[dict], key) -> dict[str, int]:
    """Occurrences of ``key(v)`` across *raw*, unknown keys bucketed as ``(unknown)``."""
    counts: dict[str, int] = {}
    for v in raw:
        k = key(v) or "(unknown)"
        counts[k] = counts.get(k, 0) + 1
    return counts


def _top_counts(counts: dict[str, int], n: int) -> dict[str, int]:
    """The *n* largest buckets of *counts*, largest first, ties by key."""
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return dict(ranked[:n])


def get_violations(ctx: ToolContext, dimension: str | None = None,
                    limit: int = _VIOLATIONS_DEFAULT_LIMIT,
                    path: str | None = None) -> dict:
    """One page of violations for the run or overview scope, severity first,
    with per-principle, per-requirement and per-file counts.

    *path* narrows the scope to one folder or file (see ``path_matches``);
    the counts then describe that folder, which is what a "why does this
    module have so many findings" question needs.
    """
    limit = clamp(int(limit), 1, VIOLATIONS_MAX_LIMIT)
    if has_run(ctx):
        raw, dim_out, hidden = _violations_from_run(ctx, dimension)
    else:
        raw, dim_out, hidden = _violations_from_accumulated(ctx, dimension)

    total_in_scope = len(raw)
    norm_path = _normalize_path(path) if path else ""
    if norm_path:
        raw = [v for v in raw if path_matches(v.get("file"), norm_path)]

    # The counts reflect ALL matching violations so "worst principle" and
    # "worst file" stay accurate even when the returned list is capped by
    # `limit`. by_file is capped so a project-wide call stays small.
    by_principle = _count_by(raw, _principle_of)
    by_requirement = _count_by(raw, requirement_of)
    by_file = _top_counts(_count_by(raw, lambda v: v.get("file")), _BY_FILE_TOP_N)

    # nsmallest keeps sorted()'s stable tie order but skips ordering the
    # entries past `limit` that the page drops anyway.
    page = heapq.nsmallest(limit, raw, key=_severity_key)
    trimmed = [trim_violation(v) for v in page]
    out = {"dimension": dim_out, "count": len(raw), "violations": trimmed,
           "by_principle": by_principle, "by_requirement": by_requirement,
           "by_file": by_file, "hiddenStandardIds": hidden}
    if norm_path:
        out["path"] = norm_path
        out["total_in_scope"] = total_in_scope
    return out


def _violations_from_run(ctx: ToolContext, dimension: str | None):
    eval_dir = ctx.run_dir / "evaluation"
    if dimension:
        validate_dimension(dimension)
        path = eval_dir / f"{dimension}.json"
        if not path.is_file():
            raise ToolError(
                f"no report for dimension: {dimension} in this run. "
                "Check get_scores for available dimensions, or get_overview "
                "for accumulated scores across runs.")
        scored = scored_run_dims(ctx)
        if scored is not None:
            entry = find_dimension(scored, dimension)
            if entry is not None:
                return entry.get("violations") or [], dimension, []
        # Fall back to the raw report only when the dismiss/delete rescore
        # has no answer -- read_eval_report re-checks existence itself, but
        # the is_file() above still gates the not-found error message so a
        # missing dim never falls through to scored_run_dims for nothing.
        try:
            report = read_eval_report(eval_dir, dimension) or {}
        except (OSError, ValueError) as exc:
            raise ToolError(f"could not read report for dimension: {dimension}") from exc
        return report.get("violations") or [], dimension, []
    if not eval_dir.is_dir():
        raise ToolError(
            "no evaluation reports in this run. Try get_overview for "
            "accumulated scores across runs.")
    scored = scored_run_dims(ctx)
    if scored is None:
        scored = raw_run_dims(eval_dir)
    kept, hidden = visible_only(ctx, scored)
    return [v for d in kept for v in (d.get("violations") or [])], None, hidden


def _violations_from_accumulated(ctx: ToolContext, dimension: str | None):
    dims = accumulated_dims(ctx)
    if dims is None:
        raise no_scope_error()
    if dimension:
        entry = accumulated_dimension(
            ctx, dims, dimension, hint=". Or try get_overview for accumulated scores.")
        return entry.get("violations") or [], dimension, []
    kept, hidden = visible_only(ctx, dims)
    raw: list = []
    for d in kept:
        raw.extend(d.get("violations") or [])
    return raw, None, hidden
