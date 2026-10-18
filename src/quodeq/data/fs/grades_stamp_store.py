"""Which grade formula a run's stored grade tables were computed with.

``recompute_grades`` writes ``grades.stamp`` (``grades_stamp(params)``) next to
``evaluation.db`` after it rewrites the tables. The score cache folds the stamp
into each run's version, so a row cached from a run's tables before a
grade-formula rescore reached that run is never served after it. A file, not
a ``run_meta`` row: the version is computed for every run on every dashboard
read, and opening each run's database costs about a millisecond.
The archive leaves it in place (it packs only the files it names).
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from quodeq.shared.utils import TEXT_ENCODING

GRADES_STAMP_NAME = "grades.stamp"


def read_grades_stamp(run_dir: Path) -> str:
    """The run's grades stamp; ``""`` when the tables predate stamps or the file is unreadable."""
    try:
        return (run_dir / GRADES_STAMP_NAME).read_text(encoding=TEXT_ENCODING).strip()
    except (OSError, UnicodeDecodeError):
        return ""


def write_grades_stamp(run_dir: Path, stamp: str) -> None:
    """Atomically record *stamp* for *run_dir*. Raises OSError."""
    tmp: str | None = None
    try:
        fd, tmp = tempfile.mkstemp(dir=run_dir, prefix=f".{GRADES_STAMP_NAME}.", suffix=".tmp")
        with os.fdopen(fd, "w", encoding=TEXT_ENCODING) as fh:
            fh.write(stamp)
        os.replace(tmp, run_dir / GRADES_STAMP_NAME)
    except OSError:
        if tmp is not None:
            Path(tmp).unlink(missing_ok=True)
        raise
