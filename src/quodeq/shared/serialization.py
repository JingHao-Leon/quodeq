"""Dataclass-to-camelCase-dict serialization utilities."""
from __future__ import annotations

import dataclasses
import re

# Real home is core.finding_identity (the dismiss keys it normalizes live
# there); re-exported so existing importers keep working.
from quodeq.core.finding_identity import coerce_line  # noqa: F401 — re-export
from quodeq.core.types.wire_fields import WIRE_HIDDEN_KEY

_CAMEL_RE = re.compile(r"_([a-z])")


def _to_camel(name: str) -> str:
    return _CAMEL_RE.sub(lambda m: m.group(1).upper(), name)


_MAX_DEPTH = 64


def to_camel_dict(obj: object, *, _depth: int = 0) -> object:
    """Recursively convert a frozen dataclass to a camelCase dict.

    None fields are omitted, and so are fields marked ``WIRE_HIDDEN``
    (internal carriers no payload shape includes).
    """
    if _depth >= _MAX_DEPTH:
        return obj
    next_depth = _depth + 1
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {
            _to_camel(f.name): to_camel_dict(getattr(obj, f.name), _depth=next_depth)
            for f in dataclasses.fields(obj)
            if getattr(obj, f.name) is not None and not f.metadata.get(WIRE_HIDDEN_KEY)
        }
    if isinstance(obj, list):
        return [to_camel_dict(item, _depth=next_depth) for item in obj]
    if isinstance(obj, dict):
        return {k: to_camel_dict(v, _depth=next_depth) for k, v in obj.items()}
    return obj
