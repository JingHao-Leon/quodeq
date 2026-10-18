"""What a storage pass is asked to do, what it reports back to its caller, and what it did."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class ColdPolicy:
    """What a pass may do to archived runs: pack their reports, and trim the ones older than *cold_after_days*.

    The held first start passes ``pack=False``; it neither packs nor trims.
    """

    cold_after_days: int | None = None
    pack: bool = True


@dataclass(frozen=True)
class CleanupHooks:
    """What a pass reports to and asks of its caller: progress after each run, and whether to stop before the next."""

    on_progress: Callable[[int, int], None] | None = None
    should_stop: Callable[[], bool] | None = None


@dataclass(frozen=True)
class CleanupResult:
    """What a cleanup pass did; ``packed`` counts archived runs whose reports it packed."""

    tidied: int
    archived: int
    bytes_freed: int
    packed: int = 0
    trimmed: int = 0
