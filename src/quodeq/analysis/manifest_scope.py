"""Scope filtering for source manifests.

Moved from ``_cli_resolution`` (which re-exports it for CLI callers): the
function operates purely on analysis types, and living here lets in-layer
callers (run start mirrors such as the estimates API) use it without a
layer violation.
"""
from __future__ import annotations

import os

from quodeq.analysis.manifest_models import AnalysisTarget, SourceManifest
from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.shared.validation import normalize_relative_scope


def _carried_total_lines(manifest: SourceManifest, scoped: list[AnalysisTarget]) -> int | None:
    """The line count survives the filter only when the filter dropped no file.

    A manifest built for a scope already walked just that subtree, so the
    filter usually keeps everything; when it did drop files the old count no
    longer describes the result and is reported as unmeasured instead.
    """
    before = sum(len(t.source_files) for t in manifest.targets)
    after = sum(len(t.source_files) for t in scoped)
    return manifest.total_lines if before == after else None


def filter_manifest_by_scope(
    manifest: SourceManifest | None, scope_path: str, *, log: LogSink = NULL_LOG,
) -> SourceManifest | None:
    """Narrow a manifest to only files under *scope_path*.

    *scope_path* is canonicalized first: the manifest's paths are
    repo-relative and POSIX-style, so a scope spelled "./src" has to be
    reduced to "src" before it can be compared against them.

    Returns None (logging a warning) when no files match.
    """
    if not manifest or not manifest.targets:
        return manifest

    scope = normalize_relative_scope(scope_path)
    prefix = f"{scope}/" if scope else ""
    scoped_targets: list[AnalysisTarget] = []
    total = 0
    all_stats: dict[str, int] = {}

    for t in manifest.targets:
        scoped_files = [f for f in t.source_files if f.startswith(prefix) or f == scope]
        if not scoped_files:
            continue
        stats: dict[str, int] = {}
        for f in scoped_files:
            ext = os.path.splitext(f)[1]
            if ext:
                stats[ext] = stats.get(ext, 0) + 1
        scoped_targets.append(AnalysisTarget(
            name=t.name, language=t.language,
            source_files=scoped_files, total_files=len(scoped_files),
            language_stats=stats, category=t.category,
        ))
        total += len(scoped_files)
        for k, v in stats.items():
            all_stats[k] = all_stats.get(k, 0) + v

    if scoped_targets:
        log.info(f"Scope filter: {total} files under '{scope}'")
        # skipped_untracked and unreadable_dirs travel with the manifest by
        # contract, so carry them across the rebuild rather than resetting
        # them to zero here.
        return SourceManifest(
            targets=scoped_targets, total_files=total, language_stats=all_stats,
            skipped_untracked=manifest.skipped_untracked,
            unreadable_dirs=manifest.unreadable_dirs,
            total_lines=_carried_total_lines(manifest, scoped_targets),
        )

    log.warning(
        f"No source files found under scope '{scope}'. "
        "The scoped folder contains no recognized source code files."
    )
    return None
