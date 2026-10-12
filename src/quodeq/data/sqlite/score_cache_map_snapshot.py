"""Map-snapshot rows of the score cache (one JSON payload per project run).

The cache is only an accelerator: these functions open it themselves, log and
swallow storage errors, and hand back plain data, so a caller never sees the
storage driver.
"""
from __future__ import annotations

import logging
import sqlite3

from quodeq.data.sqlite.score_cache_db import open_score_cache
from quodeq.data.sqlite.score_cache_run_payloads import MAP_SNAPSHOT, load_run_payloads, prune_run_payloads, store_run_payloads

_logger = logging.getLogger(__name__)


def load_map_snapshot_payloads(project: str, keys: dict[str, str]) -> dict[str, dict]:
    """The cached snapshot payloads of *keys*' runs (``run_id -> key``) whose stored key still matches.

    {} when the cache cannot be opened or read (logged): the caller rebuilds.
    """
    try:
        with open_score_cache() as conn:
            return load_run_payloads(conn, MAP_SNAPSHOT, project, keys)
    except (sqlite3.Error, OSError):
        _logger.warning("map snapshot cache unavailable for %s", project, exc_info=True)
        return {}


def save_map_snapshot_payloads(project: str, payloads: dict[str, tuple[str, dict]], keep_run_ids: set[str]) -> None:
    """Drop *project*'s snapshot rows outside *keep_run_ids*, then store *payloads* (``run_id -> (key, payload)``) in one transaction.

    Best-effort: a cache that cannot be opened or written is logged and left as it is.
    """
    try:
        with open_score_cache() as conn:
            prune_run_payloads(conn, MAP_SNAPSHOT, project, keep_run_ids)
            store_run_payloads(conn, MAP_SNAPSHOT, project, payloads)
    except (sqlite3.Error, OSError):
        _logger.warning("map snapshot cache not written for %s", project, exc_info=True)
