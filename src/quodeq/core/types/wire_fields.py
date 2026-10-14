"""Dataclass field metadata the wire serializer honours.

A leaf module so the domain types can mark a field without importing the
serializer that reads the mark (``shared.serialization``).
"""
from __future__ import annotations

from types import MappingProxyType

#: Metadata key of a field that travels between layers but is never written
#: into a JSON payload by the camelCase serializer.
WIRE_HIDDEN_KEY = "wire_hidden"
#: The ``field(metadata=...)`` value that marks such a field.
WIRE_HIDDEN = MappingProxyType({WIRE_HIDDEN_KEY: True})
