"""Date parsing helpers for run directories."""
from __future__ import annotations

import os
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from quodeq.shared.logging import log_debug
from quodeq.data.fs.report_files import REPORT_SUFFIX, list_report_files, read_report_json
from quodeq.shared.utils import read_json


def normalize_date(raw: str) -> tuple[str, str] | None:
    """Parse a date/datetime string and return (sortable_iso, human_label).

    Accepts ISO datetime (2026-03-01T14:30:25), ISO date (2026-03-01),
    or compact date (20260301). Datetime values are normalized to UTC
    and emitted with an explicit ``Z`` suffix so JavaScript clients
    render them in the user's local timezone — without the suffix the
    ECMAScript spec interprets the offset-less string as *local* time,
    which surfaces UTC as if it were the user's wall clock.
    """
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%Y%m%d"):
        try:
            parsed = datetime.strptime(raw, fmt)
            if "T" in fmt:
                if parsed.tzinfo is not None:
                    parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                sortable = parsed.isoformat(timespec='seconds') + 'Z'
            else:
                sortable = parsed.date().isoformat()
            label = parsed.strftime(f"{parsed.day} %b %Y")
            return sortable, label
        except ValueError:
            continue
    return None


def _dated_candidates(
    directory: Path, suffix: str, safe_read_dir: Callable[[Path], list[os.DirEntry[str]]],
) -> list[Path]:
    """The files to scan: the reports in both forms for ``.json``, else the entries ending in *suffix*."""
    if suffix == REPORT_SUFFIX:
        return [path for _, path in list_report_files(directory)]
    return [Path(e.path) for e in safe_read_dir(directory) if e.is_file() and e.name.endswith(suffix)]


def find_date_in_dir(
    directory: Path, suffix: str, safe_read_dir: Callable[[Path], list[os.DirEntry[str]]],
) -> tuple[str | None, str] | None:
    """Scan JSON files in *directory* matching *suffix* for a parsable date field.

    Args:
        directory: Path to the directory to scan.
        suffix: File-name suffix to filter on (e.g. ``"_evidence.json"``).
        safe_read_dir: Callable that lists directory entries, returning an
            empty list on OS errors.

    Returns:
        A ``(sortable_iso, human_label)`` tuple from the first file whose
        ``"date"`` field is parsable, or ``None`` if no date is found.
    """
    for path in _dated_candidates(directory, suffix, safe_read_dir):
        try:
            data = read_report_json(path) if suffix == REPORT_SUFFIX else read_json(path)
            raw = data.get("date")
            if raw:
                result = normalize_date(str(raw))
                if result:
                    return result
        except (ValueError, OSError, UnicodeDecodeError) as exc:
            log_debug(f"Failed to read date from {path.name}: {exc}")
    return None
