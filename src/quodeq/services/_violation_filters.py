"""Suppression filters over parsed violation dicts (eval JSON / markdown results).

Dismissals go through the shared ``is_dismissed`` predicate (snippet
fingerprint, ``req || principle`` fallback) rather than a hand-built key, so
this view agrees with every other suppression surface. Deletions match on
``(dimension, principle, file)``.
"""
from __future__ import annotations

from typing import Any

from quodeq.core.dismissals import DismissedKeys
from quodeq.core.finding_identity import SuppressionSubject, coerce_line, dismiss_fingerprints
from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.core.types import ViolationResponse
from quodeq.core.types.suppression_rule import SuppressionRule
from quodeq.services.suppression_keys import FindingRef, SuppressionKeys, is_dismissed


def violation_location(v: dict, *, log: LogSink = NULL_LOG) -> tuple[str, int]:
    """``(file, line)`` of a violation dict.

    Handles two formats:
    - Separated: file="path/to/file.py", line=42
    - Combined: file="path/to/file.py:42", line=None
    """
    raw_file = v.get("file") or ""
    line = v.get("line")
    if line is not None:
        return (raw_file, coerce_line(line))
    # Parse line from "file:line" format
    if ":" in raw_file:
        parts = raw_file.rsplit(":", 1)
        try:
            return (parts[0], int(parts[1]))
        except (ValueError, IndexError) as exc:
            log.debug(f"violation line could not be parsed for its dismissal key: {exc}")
    return (raw_file, 0)


def _violation_dismissed(
    v: dict, dismissed: "DismissedKeys | set[tuple]", principle: str | None,
    rules: "tuple[SuppressionRule, ...]" = (),
) -> bool:
    """The shared predicate on a violation dict (snippet-aware, ``req || principle``, pattern rules)."""
    file, line = violation_location(v)
    return is_dismissed(dismissed, FindingRef(
        req=v.get("req"),
        principle=principle or v.get("practiceId") or v.get("principle"),
        file=file, line=line, snippet=v.get("snippet"),
    ), rules=rules)


def deleted_key_for_violation(v: dict, dimension: str, principle: str | None = None) -> tuple:
    """Build a (dimension, principle, file) suppression key from a violation dict.

    Parsed eval violations are camelCase (``practiceId``); ``principle`` is
    kept as a fallback for pre-camelCase dicts. Principle-group entries carry
    no principle field at all, so callers pass the group name as *principle*.
    """
    raw_file = v.get("file") or ""
    if v.get("line") is None and ":" in raw_file:
        raw_file = raw_file.rsplit(":", 1)[0]
    if principle is None:
        principle = v.get("practiceId") or v.get("principle") or ""
    return (dimension or "", principle or "", raw_file)


def is_suppressed_violation(
    v: dict, keys: SuppressionKeys, dimension: str, principle: str | None = None,
) -> bool:
    """True when the app hides the violation dict *v*: dismissed, deleted, or matched by a pattern rule.

    *principle* is None for a result's top-level list (each violation names
    its own) and the group name for a principle group's list.
    """
    if _violation_dismissed(v, keys.dismissed, principle, keys.rules):
        return True
    return bool(keys.deleted) and deleted_key_for_violation(v, dimension, principle) in keys.deleted


def suppression_subject(v: dict, dimension: str) -> SuppressionSubject:
    """What :func:`is_suppressed_violation` reads of the top-level violation *v*, kept without its snippet.

    The map history stores this per distinct violation and judges it later
    with :func:`is_suppressed_subject`, so a dismissal never needs the report.
    """
    file, line = violation_location(v)
    req = str(v.get("req") or "")
    principle = str(v.get("practiceId") or v.get("principle") or "")
    return SuppressionSubject(
        dimension or "", req, principle, file, line,
        dismiss_fingerprints(req, principle, v.get("snippet")),
        deleted_key_for_violation(v, dimension)[2],
    )


def is_suppressed_subject(subject: SuppressionSubject, keys: SuppressionKeys) -> bool:
    """:func:`is_suppressed_violation` for a stored subject: the same dismiss, rule and delete checks."""
    ref = FindingRef(req=subject.req, principle=subject.principle, file=subject.file,
                     line=subject.line, fingerprints=subject.fingerprints)
    if is_dismissed(keys.dismissed, ref, rules=keys.rules):
        return True
    return bool(keys.deleted) and (subject.dimension, subject.principle, subject.deleted_file) in keys.deleted


def unsuppressed(
    violations: list[dict], dkeys: "DismissedKeys | set[tuple]", delkeys: "set[tuple] | None",
    dimension: str, principle: str | None,
) -> list[dict]:
    """*violations* minus the dismissed and the permanently deleted ones.

    *principle* is None for a result's top-level list (each violation names
    its own) and the group name for a principle group's list.
    """
    keys = SuppressionKeys(dkeys, delkeys or frozenset())
    return [v for v in violations if not is_suppressed_violation(v, keys, dimension, principle)]


def filter_dismissed_from_result(
    result: "ViolationResponse | dict[str, Any] | None",
    dkeys: "DismissedKeys | set[tuple]",
    delkeys: "set[tuple] | None" = None,
    dimension: str = "",
) -> "ViolationResponse | dict[str, Any] | None":
    """Remove dismissed and permanently-deleted violations from any result format."""
    if not result or (not dkeys and not delkeys):
        return result
    if isinstance(result, dict):
        if "violations" in result:
            result["violations"] = unsuppressed(result["violations"], dkeys, delkeys, dimension, None)
        for p in result.get("principles", []):
            if "violations" in p:
                group_principle = p.get("name", "") or ""
                p["violations"] = unsuppressed(p["violations"], dkeys, delkeys, dimension, group_principle)
    return result
