"""Dataclass-to-camelCase-dict serialization utilities."""
from __future__ import annotations

import dataclasses
import re

# Real home is core.finding_identity (the dismiss keys it normalizes live
# there); re-exported so existing importers keep working.
from quodeq.core.finding_identity import coerce_line  # noqa: F401 — re-export
from quodeq.core.types.report import PrincipleGrade

_CAMEL_RE = re.compile(r"_([a-z])")


def _to_camel(name: str) -> str:
    return _CAMEL_RE.sub(lambda m: m.group(1).upper(), name)


_MAX_DEPTH = 64
# Fields that travel between layers but no payload carries: a principle
# grade's violation counts (read by the principle-series payload alone, which
# builds its own shape), so the grades the Overview, run detail and scores
# serialize keep develop's wire shape.
_INTERNAL_FIELDS: frozenset[tuple[type, str]] = frozenset({(PrincipleGrade, "counts")})


def to_camel_dict(obj: object, *, _depth: int = 0) -> object:
    """Recursively convert a frozen dataclass to a camelCase dict.

    None fields are omitted, and so are ``_INTERNAL_FIELDS`` (internal
    carriers no payload shape includes).
    """
    if _depth >= _MAX_DEPTH:
        return obj
    next_depth = _depth + 1
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {
            _to_camel(f.name): to_camel_dict(getattr(obj, f.name), _depth=next_depth)
            for f in dataclasses.fields(obj)
            if getattr(obj, f.name) is not None and (type(obj), f.name) not in _INTERNAL_FIELDS
        }
    if isinstance(obj, list):
        return [to_camel_dict(item, _depth=next_depth) for item in obj]
    if isinstance(obj, dict):
        return {k: to_camel_dict(v, _depth=next_depth) for k, v in obj.items()}
    return obj
