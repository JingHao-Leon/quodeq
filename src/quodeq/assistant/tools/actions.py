"""draft_action: the model's only write primitive, server-canonical drafts."""
from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlparse

from quodeq.assistant.action_status import ActionStatus
from quodeq.assistant.frame_type import FrameType
from quodeq.assistant.tools._context import ToolContext
from quodeq.assistant.tools.action_context import ActionContext
from quodeq.assistant.tools.registry import ToolError, ToolRegistry, ToolSpec
from quodeq.services.import_validator import validate_import
from quodeq.shared.validation import validate_path_segment


# Fewest requirements a drafted principle may carry. One or two checks per
# principle is the shallow draft the interview exists to prevent; a narrow
# standard gets fewer principles, not thinner ones.
MIN_REQUIREMENTS_PER_PRINCIPLE = 3


class ActionConflict(Exception):
    """Apply-time domain conflict; the endpoint maps it to HTTP 409."""


@dataclass(frozen=True)
class ActionSpec:
    """One action type's validate/summarize/apply triple."""

    action_type: str
    description: str
    validate: Callable[[dict, ToolContext], dict]      # raises ToolError / returns canonical payload
    summarize: Callable[[dict], dict]                  # server-canonical card summary fields
    apply: Callable[[dict, ActionContext], dict]       # executes on user approval


def _hollow_content_errors(canonical: dict) -> list[str]:
    """Why a drafted standard is not yet reviewable, one complaint per gap.

    The import validator accepts an empty requirements list and requirements
    without id or text (the manual import route tolerates skeletons the
    editor fills in later). A drafted standard is different: the user reviews
    it on a card and applies it as-is, so every principle needs at least
    MIN_REQUIREMENTS_PER_PRINCIPLE requirements and every requirement needs an
    id and a checkable text. The
    complaints go back to the model in-loop, which rewrites the payload
    instead of handing the user an empty card.
    """
    errors: list[str] = []
    for index, principle in enumerate(canonical.get("principles", [])):
        label = f"principle {index} ({principle.get('name')!r})"
        requirements = principle.get("requirements") or []
        if not requirements:
            errors.append(f"{label} has no requirements")
        elif len(requirements) < MIN_REQUIREMENTS_PER_PRINCIPLE:
            errors.append(f"{label} has {len(requirements)} requirements, "
                          f"needs at least {MIN_REQUIREMENTS_PER_PRINCIPLE}")
        for req_index, req in enumerate(requirements):
            if not str(req.get("id") or "").strip():
                errors.append(f"{label} requirement {req_index} is missing an id")
            if not str(req.get("text") or "").strip():
                errors.append(f"{label} requirement {req_index} is missing its text")
    return errors


def _validate_create_standard(payload: dict, _ctx: ToolContext) -> dict:
    verdict = validate_import(payload)
    if not verdict["valid"]:
        raise ToolError("invalid standard payload: " + "; ".join(verdict["errors"]))
    hollow = _hollow_content_errors(verdict["data"])
    if hollow:
        raise ToolError(f"incomplete standard, every principle needs at least "
                        f"{MIN_REQUIREMENTS_PER_PRINCIPLE} requirements, each with an id "
                        "and a checkable text: " + "; ".join(hollow))
    return verdict["data"]


_LINK_SCHEMES = frozenset({"http", "https"})


def _summarize_ref(ref: dict) -> dict:
    """A requirement reference as the card shows it: a label and, when the
    url is a web link, the url. Any other scheme is dropped so the card never
    renders a javascript: or file: href from a model-written payload."""
    url = str(ref.get("url") or "")
    name = str(ref.get("name") or "").strip() or " ".join(
        str(ref.get(k)) for k in ("source", "id") if ref.get(k)) or url
    return {"name": name, "url": url if urlparse(url).scheme in _LINK_SCHEMES else None}


def _summarize_requirement(req: dict) -> dict:
    refs = [_summarize_ref(r) for r in req.get("refs") or [] if isinstance(r, dict)]
    return {"id": req.get("id"), "text": req.get("text"),
            "refs": [r for r in refs if r["name"]]}


def _summarize_create_standard(canonical: dict) -> dict:
    # The outline is what the user reads on the preview card before Apply;
    # it is cut from the canonical payload, never from model prose.
    principles = canonical.get("principles", [])
    return {
        "id": canonical.get("id"), "name": canonical.get("name"),
        "principleCount": len(principles),
        "principles": [{
            "name": p.get("name"),
            "requirements": [_summarize_requirement(r) for r in p.get("requirements", [])],
        } for p in principles],
    }


def _apply_create_standard(payload: dict, ctx: ActionContext) -> dict:
    result = ctx.import_standard(payload)
    if result is None:
        raise ActionConflict("standard id already exists")
    return result


def _canonical_finding_key(payload: dict, ctx: ToolContext) -> dict:
    # A finding's identity is (req, file, line). `req` (the requirement id) is
    # OPTIONAL on a finding -- practiceId is the guaranteed field and `req` is
    # frequently absent -- and the suppression filter keys on `req or ""`. So we
    # accept an empty req (a req=None finding is dismissed with req=""), mirror-
    # ing the dashboard, which echoes the finding's own req verbatim. file and a
    # non-negative integer line are always required; _require_matching_finding
    # then confirms the whole key matches a real finding before it is recorded.
    req = str(payload.get("req") or "").strip()
    file = str(payload.get("file") or "").strip()
    line = payload.get("line")
    if not file or not isinstance(line, int) or isinstance(line, bool) or line < 0:
        raise ToolError("file and a non-negative integer line are required")
    if not ctx.project_id:
        raise ToolError("no project attached to this session")
    try:
        validate_path_segment(ctx.project_id)
    except ValueError:
        raise ToolError("invalid project attached to this session")
    # The project always comes from the session, never from the model.
    canonical = {"project": ctx.project_id, "req": req, "file": file, "line": line}
    if ctx.run_dir is not None:
        canonical["runId"] = ctx.run_dir.name
    return canonical


def _require_matching_finding(ctx: ToolContext, canonical: dict) -> None:
    """Reject a finding action whose key matches no finding in scope.

    The model must dismiss/verify by the finding's real (req, file, line) --
    obtainable from get_report/get_violations (now carrying `requirement`) or
    search_findings. If the key matches nothing, recording it would be a silent
    no-op that reports success but never suppresses the finding, so we fail the
    draft in-loop with a message that tells the model how to get the right key.
    """
    from quodeq.assistant.tools._read_tools import finding_keys_in_scope  # noqa: PLC0415

    key = (canonical["req"], canonical["file"], canonical["line"])
    if key not in finding_keys_in_scope(ctx):
        raise ToolError(
            f"no finding matches file={canonical['file']} line={canonical['line']} "
            f"req={canonical['req'] or '(none)'} in this scope. Read the exact "
            "requirement with get_report or search_findings, then retry with it.")


def _validate_dismiss_finding(payload: dict, ctx: ToolContext) -> dict:
    canonical = _canonical_finding_key(payload, ctx)
    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise ToolError("a dismissal reason is required")
    _require_matching_finding(ctx, canonical)
    canonical["reason"] = reason
    return canonical


def _summarize_dismiss_finding(canonical: dict) -> dict:
    return {"req": canonical["req"], "file": canonical["file"],
            "line": canonical["line"], "reason": canonical["reason"]}


def _finding_key_fields(payload: dict) -> dict:
    return {"req": payload["req"], "file": payload["file"], "line": payload["line"]}


def _apply_dismiss_finding(payload: dict, ctx: ActionContext) -> dict:
    project = payload["project"]
    validate_path_segment(project)
    run_id = payload.get("runId")
    ctx.dismiss_finding(project, {**_finding_key_fields(payload), "dismissReason": payload["reason"]}, run_id)
    scores = ctx.rescore(project, run_id)
    # Mirror the manual /api/findings/dismiss route so the UI can patch its
    # caches from this response instead of waiting on a lazy invalidation.
    # run_id is None in overview scope -- dismiss_delta handles that by
    # returning an inert-but-valid envelope (isLatest False, accumulated None).
    delta = ctx.dismiss_delta(project, run_id, _finding_key_fields(payload))
    return {"dismissed": True, "scores": scores, "delta": delta}


def _validate_verify_finding(payload: dict, ctx: ToolContext) -> dict:
    canonical = _canonical_finding_key(payload, ctx)
    note = str(payload.get("note") or "").strip()
    if not note:
        raise ToolError("a one-line note explaining why the finding is real is required")
    _require_matching_finding(ctx, canonical)
    canonical["note"] = note
    return canonical


def _summarize_verify_finding(canonical: dict) -> dict:
    return {"req": canonical["req"], "file": canonical["file"],
            "line": canonical["line"], "note": canonical["note"]}


def _apply_verify_finding(payload: dict, ctx: ActionContext) -> dict:
    validate_path_segment(payload["project"])
    ctx.verify_finding(payload["project"], payload)
    return {"verified": True}


ACTIONS: dict[str, ActionSpec] = {
    "create_standard": ActionSpec(
        action_type="create_standard",
        description="Draft a new custom standard. Applied only after you approve the preview card.",
        validate=_validate_create_standard,
        summarize=_summarize_create_standard,
        apply=_apply_create_standard,
    ),
    "dismiss_finding": ActionSpec(
        action_type="dismiss_finding",
        description="Dismiss a finding as a false positive, with a reason. Applied only after you approve the preview card; scores are recomputed.",
        validate=_validate_dismiss_finding,
        summarize=_summarize_dismiss_finding,
        apply=_apply_dismiss_finding,
    ),
    "verify_finding": ActionSpec(
        action_type="verify_finding",
        description="Mark a finding as human-verified real, with a short note. Adds a badge on the violations screen; scores are unchanged.",
        validate=_validate_verify_finding,
        summarize=_summarize_verify_finding,
        apply=_apply_verify_finding,
    ),
}

# Derived views kept for the catalog route and existing imports.
ACTION_TYPES = frozenset(ACTIONS)
ACTION_DESCRIPTIONS = {t: s.description for t, s in ACTIONS.items()}


def _draft_action(ctx: ToolContext, action_type: str, payload: dict) -> dict:
    spec = ACTIONS.get(action_type)
    if spec is None:
        raise ToolError(f"unsupported action type: {action_type}")
    canonical = spec.validate(payload, ctx)
    action_id = uuid.uuid4().hex
    content_hash = hashlib.sha256(
        json.dumps(canonical, sort_keys=True).encode("utf-8")
    ).hexdigest()
    ctx.repository.create_action(
        action_id=action_id, session_id=ctx.session_id,
        action_type=action_type, payload=canonical, content_hash=content_hash,
    )
    ctx.repository.append_event(ctx.session_id, {
        "type": FrameType.ACTION_DRAFT, "actionId": action_id, "actionType": action_type,
        "summary": spec.summarize(canonical),
    })
    return {"action_id": action_id, "status": ActionStatus.DRAFTED, "action_type": action_type}


def register_action_tools(registry: ToolRegistry, ctx: ToolContext) -> None:
    """Register the ``draft_action`` write primitive on ``registry``."""
    registry.register(ToolSpec(
        "draft_action",
        "Draft an action for the user to review and apply. The draft is shown "
        "to the user as a preview card; nothing is written until they approve. "
        "Payloads by type: create_standard takes a full standard JSON; "
        "dismiss_finding takes {req, file, line, reason}; "
        "verify_finding takes {req, file, line, note}.",
        {"type": "object", "properties": {
            "action_type": {"type": "string", "enum": sorted(ACTION_TYPES)},
            "payload": {"type": "object"},
        }, "required": ["action_type", "payload"]},
        lambda **kw: _draft_action(ctx, **kw)))
