"""The install-normalized form of a shared standard (pure, no I/O).

``normalized_for_share`` is exactly what an install keeps: the import
allowlists (``sanitize_import``) plus the extras a duplicated built-in
carries (principle ``id`` / ``source``; requirement ``params``, ``severity``,
``scope``, ``source``, ``hints``, ``verifiability``, ``level``, ``name``,
``check``), which the analysis uses. Each extra is copied only when its type
is right (a malformed one is dropped, never repaired) and its texts are
capped like the import caps requirement text. ``share_hash`` hashes this
form, so every machine compares the same thing.
"""
from __future__ import annotations

import re
from collections.abc import Callable, Iterator

from quodeq.core.types.severity import is_severity
from quodeq.services.import_validator import sanitize_import

_PARAM_TEXT_KEYS = ("label", "type")
_PARAM_NUMBER_KEYS = ("default", "min", "max")
# A built-in deterministic check's id, e.g. "entity-imports"; never code.
_CHECK_ID = re.compile(r"[a-z0-9][a-z0-9-]*")
# Same cap validate_import applies to requirement text and descriptions.
_MAX_EXTRA_TEXT = 2000


def _is_str(value: object) -> bool:
    return isinstance(value, str)


def _is_str_or_none(value: object) -> bool:
    return value is None or isinstance(value, str)


def _is_number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _is_param(spec: object) -> bool:
    if not isinstance(spec, dict) or not all(_is_str(spec.get(k)) for k in _PARAM_TEXT_KEYS):
        return False
    return all(_is_number(spec[k]) for k in _PARAM_NUMBER_KEYS if k in spec)


def _is_params(value: object) -> bool:
    return isinstance(value, dict) and all(_is_str(n) and _is_param(s) for n, s in value.items())


def _is_hint_text(value: object) -> bool:
    return _is_str(value) or (isinstance(value, list) and all(_is_str(v) for v in value))


def _is_hints(value: object) -> bool:
    return isinstance(value, dict) and all(_is_str(k) and _is_hint_text(v) for k, v in value.items())


def _is_check(value: object) -> bool:
    return _is_str(value) and _CHECK_ID.fullmatch(value) is not None


def _capped(value: str) -> str:
    return value[:_MAX_EXTRA_TEXT]


def _clean_params(value: dict) -> dict:
    keys = (*_PARAM_TEXT_KEYS, *_PARAM_NUMBER_KEYS)
    out = {name: {k: spec[k] for k in keys if k in spec} for name, spec in value.items()}
    for spec in out.values():
        spec["label"] = _capped(spec["label"])
    return out


def _clean_hints(value: dict) -> dict:
    return {k: _capped(v) if _is_str(v) else [_capped(t) for t in v] for k, v in value.items()}


def _as_is(value: object) -> object:
    return value


# key -> (is it well typed, how to copy it)
_Extras = dict[str, tuple[Callable[[object], bool], Callable]]
_PRINCIPLE_EXTRAS: _Extras = {"id": (_is_str, _as_is), "source": (_is_str, _as_is)}
_REQUIREMENT_EXTRAS: _Extras = {
    "params": (_is_params, _clean_params), "severity": (is_severity, _as_is),
    "scope": (_is_str_or_none, _as_is), "source": (_is_str, _as_is),
    "hints": (_is_hints, _clean_hints), "verifiability": (_is_str, _as_is), "level": (_is_str, _as_is),
    "name": (_is_str, _capped), "check": (_is_check, _as_is),
}


def _overlay(cleaned: dict, raw: dict, extras: _Extras) -> dict:
    """*cleaned* plus each well-typed extra field of *raw*."""
    out = dict(cleaned)
    for key, (valid, copy) in extras.items():
        if key in raw and valid(raw[key]):
            out[key] = copy(raw[key])
    return out


def _dicts(value: object) -> list[dict]:
    """The dict items of a list, in order: how the import sanitizer walks children."""
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _principle(cleaned: dict, raw: dict) -> dict:
    out = _overlay(cleaned, raw, _PRINCIPLE_EXTRAS)
    if isinstance(cleaned.get("requirements"), list):
        out["requirements"] = [_overlay(c, r, _REQUIREMENT_EXTRAS)
                               for c, r in zip(cleaned["requirements"], _dicts(raw.get("requirements")))]
    return out


def with_share_extras(sanitized: dict, remote: dict) -> dict:
    """*sanitized* (``validate_import``'s data) with the well-typed extras of *remote* put back."""
    out = dict(sanitized)
    if isinstance(sanitized.get("principles"), list):
        out["principles"] = [_principle(c, r)
                             for c, r in zip(sanitized["principles"], _dicts(remote.get("principles")))]
    return out


def _requirement_texts(req: dict) -> Iterator[tuple[str, str]]:
    where = f"requirement {req.get('id', '?')}"
    if "name" in req:
        yield f"{where} name", req["name"]
    for key, value in req.get("hints", {}).items():
        for text in [value] if _is_str(value) else value:
            yield f"{where} hint '{key}'", text
    for name, spec in req.get("params", {}).items():
        yield f"{where} parameter '{name}' label", spec["label"]


_DEFAULT_WEIGHT = 1.0  # what the editor's detail fills in for a file without one


def _weight(value: object) -> float:
    """*value* as a float; missing or not a real number reads as the default, so 1 == 1.0 == absent."""
    return float(value) if _is_number(value) else _DEFAULT_WEIGHT


def normalized_for_share(data: dict) -> dict:
    """What an install keeps of *data*: the comparable content of a shared standard."""
    out = with_share_extras(sanitize_import(data), data)
    out["weight"] = _weight(data.get("weight"))
    return out


def extra_texts(content: dict) -> list[tuple[str, str]]:
    """``(location, text)`` for every extra text ``scan_injection`` does not read.

    *content* is ``with_share_extras`` output, so every field here is well typed.
    """
    return [item for p in content.get("principles", []) for r in p.get("requirements", [])
            for item in _requirement_texts(r)]
