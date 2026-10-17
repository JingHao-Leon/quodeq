"""The first-start archive notice: the first start that would archive holds the archive back one start.

storage.json has no ``archive_notice`` until a start decides it. The first
start whose pass would archive anything only tidies and records the notice
``pending``; Settings › Storage then says what the next start archives, with
the archive-after setting and the off switch beside it. The next pass that
runs (the next start, or clean now) archives as set and records ``done``. A
start with nothing to archive records ``done`` at once, so a fresh install
never sees the notice.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from datetime import datetime
from pathlib import Path

from quodeq.core.observability import NULL_LOG, LogSink
from quodeq.services.storage_plan import plan_cleanup
from quodeq.services.storage_settings import ArchiveNotice, read_storage_settings, write_storage_settings


def mark_archive_notice_done(env: Mapping[str, str] | None = None, log: LogSink = NULL_LOG) -> None:
    """Record that archiving runs as set from now on; the notice, if any, goes."""
    settings = read_storage_settings(env)
    if settings.archive_notice is not ArchiveNotice.DONE:
        write_storage_settings(replace(settings, archive_notice=ArchiveNotice.DONE), env, log=log)


def first_start_may_archive(
    root: Path, env: Mapping[str, str] | None, now: datetime, log: LogSink = NULL_LOG,
) -> bool:
    """True when this start's pass may archive; False holds it back once and records the notice.

    The notice is held back only when it could be recorded: a storage.json
    that cannot be written never stops archiving for good.
    """
    settings = read_storage_settings(env)
    if settings.archive_notice is not None:
        mark_archive_notice_done(env, log)
        return True
    days = settings.archive_after_days
    held = days is not None and bool(plan_cleanup(root, now, days).archive)
    notice = ArchiveNotice.PENDING if held else ArchiveNotice.DONE
    saved = write_storage_settings(replace(settings, archive_notice=notice), env, log=log)
    if held and saved:
        log.info("storage cleanup: first start with old runs, archiving waits for the next start")
    return not (held and saved)
