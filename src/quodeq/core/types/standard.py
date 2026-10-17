"""Data types for custom standards / evaluators."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class StandardReference:
    """An external citation backing a requirement. ``url`` is absent for book refs."""

    type: str          # "cwe" | "book" | "url" | "custom"
    label: str
    url: str | None = None


@dataclass(frozen=True, slots=True)
class StandardHeader:
    """The fields a standard's listing row and its full detail share."""
    id: str
    name: str
    description: str
    weight: float
    source: str
    type: str           # "iso" | "quodeq" | "wcag" | "custom" | "community"
    managed: bool
    origin: str | None
    origin_hash: str | None
    subtype: str | None = None  # the family's edition: "25010" (ISO), "2.2" (WCAG)
    version: str | None = None  # that edition's revision: "2023"; quodeq's own release for quodeq standards
    created_at: str | None = None  # custom standards: ISO date the standard was created
    updated_at: str | None = None  # custom standards: ISO date of the last content change
    sources: tuple[str, ...] = ()  # built-ins: the bodies the standard draws on ("iso25010", "cisq")


@dataclass(frozen=True, slots=True)
class StandardMeta(StandardHeader):
    """Lightweight metadata for listing standards."""
    principle_count: int = 0
    requirement_count: int = 0
    sync_state: str | None = None  # shared repository connected only: a SyncState value
    published_at: str | None = None  # when the shared copy was pushed
    remote: bool = False  # True: exists only in the shared repository


@dataclass(frozen=True, slots=True)
class StandardDetail(StandardHeader):
    """Full standard with principles and requirements."""
    principles: list[dict] = field(default_factory=list)
