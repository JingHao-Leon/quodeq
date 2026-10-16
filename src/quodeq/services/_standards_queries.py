"""Query operations for listing and retrieving standards."""
from __future__ import annotations

import logging
from collections.abc import Callable, Mapping
from dataclasses import replace
from typing import NamedTuple
from pathlib import Path

from quodeq.core.types.standard import StandardDetail, StandardMeta
from quodeq.services._standards_io import (
    build_builtin_detail, build_builtin_meta, build_custom_meta, build_detail,
    count_principles_and_requirements, dotted_version, get_builtin_weight, is_builtin_id,
    iso_date, load_cwe_entries,
)
from quodeq.services.standards_sharing import sync_state
from quodeq.shared.validation import validate_path_segment

logger = logging.getLogger(__name__)
_MALFORMED = (KeyError, ValueError, TypeError, AttributeError)


def list_builtin(dimensions_file: Path, compiled_dir: Path,
                 read_json: Callable) -> list[StandardMeta]:
    """Return metadata for all built-in standards."""
    try:
        data = read_json(dimensions_file)
    except (OSError, ValueError) as exc:
        logger.warning("Cannot read dimensions file: %s", exc)
        return []
    out: list[StandardMeta] = []
    for dim in data.get("applies", []):
        try:
            meta = _read_compiled_meta(dim["id"], compiled_dir, read_json)
            built = build_builtin_meta(dim, meta.principle_count, meta.requirement_count, meta.description, meta.version)
            out.append(replace(built, sources=meta.sources))
        except (OSError, ValueError, KeyError) as exc:
            logger.warning("Skipping invalid dimension entry %r: %s", dim, exc)
    return out


class _CompiledMeta(NamedTuple):
    principle_count: int = 0
    requirement_count: int = 0
    description: str = ""
    version: str | None = None
    sources: tuple[str, ...] = ()


def _read_compiled_meta(dimension_id: str, compiled_dir: Path, read_json: Callable) -> _CompiledMeta:
    """The listing fields a built-in reads from its compiled file; empty when it is absent or unreadable."""
    path = compiled_dir / f"{dimension_id}.json"
    if not path.is_file():
        return _CompiledMeta()
    try:
        compiled = read_json(path)
    except (OSError, ValueError):
        return _CompiledMeta()
    p_count, r_count = count_principles_and_requirements(compiled)
    raw_sources = compiled.get("sources")
    sources = tuple(s for s in raw_sources if isinstance(s, str)) if isinstance(raw_sources, list) else ()
    return _CompiledMeta(p_count, r_count, compiled.get("description", ""), compiled.get("version"), sources)


def _with_dates(data: dict, path: Path, modified_date: Callable[[Path], str | None]) -> dict:
    """*data* with createdAt/updatedAt/version filled from the file's date when missing.

    In memory only: a listing never writes; the next real save persists them.
    """
    created, updated = iso_date(data.get("createdAt")), iso_date(data.get("updatedAt"))
    if created and updated:
        return data
    fallback = modified_date(path)
    if fallback is None:
        return data
    created, updated = created or fallback, updated or fallback
    return {**data, "createdAt": created, "updatedAt": updated,
            "version": data.get("version") or dotted_version(updated)}


def list_custom_with_payloads(evaluators_dir: Path, read_json: Callable,
                              modified_date: Callable[[Path], str | None]) -> list[tuple[StandardMeta, dict]]:
    """Each custom evaluator's metadata paired with the payload it was built from."""
    if not evaluators_dir.is_dir():
        return []
    out: list[tuple[StandardMeta, dict]] = []
    for path in sorted(evaluators_dir.glob("*.json")):
        try:
            data = _with_dates(read_json(path), path, modified_date)
            out.append((build_custom_meta(data, *count_principles_and_requirements(data)), data))
        except (OSError, *_MALFORMED) as exc:
            logger.warning("Skipping invalid evaluator %s: %s", path.name, exc)
    return out


def _annotate_local(meta: StandardMeta, payload: dict, shared: dict | None) -> StandardMeta:
    """*meta* with its sync state; left unannotated when the shared copy cannot be compared."""
    try:
        state = sync_state(payload, shared)
        published = shared.get("publishedAt") if shared else None
    except _MALFORMED as exc:
        logger.warning("Cannot compare %s with its shared copy: %s", meta.id, exc)
        return meta
    return replace(meta, sync_state=state.value if state else None, published_at=published)


def _remote_row(payload: dict) -> StandardMeta:
    meta = build_custom_meta(payload, *count_principles_and_requirements(payload))
    return replace(meta, remote=True, sync_state="remote_only", published_at=payload.get("publishedAt"))


def annotate_sync(customs: list[tuple[StandardMeta, dict]], remote: Mapping[str, dict],
                  builtin_ids: frozenset[str] = frozenset()) -> list[StandardMeta]:
    """Customs with their sync state, then one row per standard that exists only remotely.

    A shared file named like a built-in never becomes a row; a malformed one is skipped.
    """
    out = [_annotate_local(meta, payload, remote.get(meta.id)) for meta, payload in customs]
    taken = {meta.id for meta, _ in customs} | builtin_ids
    for sid, payload in remote.items():
        if sid in taken:
            continue
        try:
            out.append(_remote_row(payload))
        except _MALFORMED as exc:
            logger.warning("Skipping malformed shared standard %s: %s", sid, exc)
    return out


def get_standard(standard_id: str, evaluators_dir: Path, compiled_dir: Path,
                 dimensions_file: Path, read_json: Callable) -> StandardDetail:
    """Return full detail for a single standard, checking custom then built-in.

    Validates *standard_id* up-front so a path-traversal segment ('../foo')
    cannot reach the filesystem join below.
    """
    validate_path_segment(standard_id)
    custom_path = evaluators_dir / f"{standard_id}.json"
    if custom_path.is_file():
        return build_detail(read_json(custom_path))
    compiled_path = compiled_dir / f"{standard_id}.json"
    if compiled_path.is_file():
        try:
            weight = get_builtin_weight(read_json(dimensions_file), standard_id)
        except (OSError, ValueError):
            weight = 1.0
        return build_builtin_detail(read_json(compiled_path), standard_id, weight)
    raise FileNotFoundError(f"Standard not found: {standard_id}")


def check_builtin_id(standard_id: str, dimensions_file: Path,
                     read_json: Callable) -> bool:
    """Return True if *standard_id* is a built-in dimension."""
    try:
        return is_builtin_id(read_json(dimensions_file), standard_id)
    except (OSError, ValueError):
        return False


def load_cwe_list(compiled_dir: Path, read_json: Callable) -> list[dict]:
    """Load the CWE reference list from the compiled standards directory."""
    cwe_path = compiled_dir.parent / "cwe" / "audit.json"
    if not cwe_path.is_file():
        return []
    try:
        return load_cwe_entries(read_json(cwe_path))
    except (OSError, ValueError, KeyError) as exc:
        logger.warning("Cannot read CWE list: %s", exc)
        return []
