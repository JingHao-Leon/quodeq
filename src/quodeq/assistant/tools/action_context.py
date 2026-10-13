"""ActionContext: the writes an applied action performs, as injected callables.

The apply step of an action is use-case code. It decides *what* happens
(validate the project id, record a dismissal, rescore, describe the delta)
and leaves *how* to these ports, so a test drives it with fakes and the
assistant layer never names a concrete service. The real bindings live at
the composition root, ``quodeq.api.assistant_action_context``, next to the
app config they read.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class ActionContext:
    """Ports for the three action types; every argument is a value, never a path.

    ``import_standard(standard)`` returns the import result, or ``None`` when
    a standard with that id already exists (the apply step turns that into
    an ``ActionConflict``). The finding ports take the project id and the
    finding's canonical key fields; the ``run_id`` is ``None`` in overview
    scope. ``rescore`` returns the recomputed scores, or ``None`` when no
    projection was possible.
    """

    import_standard: Callable[[dict], dict | None]
    dismiss_finding: Callable[[str, dict, str | None], None]
    rescore: Callable[[str, str | None], dict | None]
    dismiss_delta: Callable[[str, str | None, dict], dict]
    verify_finding: Callable[[str, dict], None]
