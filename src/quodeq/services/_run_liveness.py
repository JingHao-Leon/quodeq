"""Whether a run's own process still writes it: the ``.pid`` rule the terminal-run scorer and the map history share."""
from __future__ import annotations

import time
from pathlib import Path

from quodeq.config.services_env import cancel_escalation_window_s
from quodeq.core.run.state import STATUS_FILENAME
from quodeq.core.utils.io import resolve_child_dir
from quodeq.services.wiring import resolve_external_pid


def terminal_long_ago(run_dir: Path) -> bool:
    """True once status.json was last written longer ago than any cancel can take.

    By then the escalation has SIGKILLed the run, so a live pid in ``.pid``
    is a reused one, not ours. A missing status.json counts as long ago.
    """
    try:
        written = (run_dir / STATUS_FILENAME).stat().st_mtime
    except OSError:
        return True
    return time.time() - written > cancel_escalation_window_s()


def run_still_writing(project_dir: Path, run_id: str) -> bool:
    """True while *run_id*'s ``.pid`` names a live process that is still the run's own (a cancelled run drains)."""
    run_dir = resolve_child_dir(project_dir, run_id)
    if run_dir is None or terminal_long_ago(Path(run_dir)):
        return False
    return resolve_external_pid(project_dir, run_id) is not None
