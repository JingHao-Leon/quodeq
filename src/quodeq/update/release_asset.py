"""Which download URL the dashboard app may update itself from.

Only the macOS dashboard DMG attached to a quodeq/quodeq GitHub release:
https, github.com, no userinfo or port, the releases download path, and the
``Quodeq-*-macOS.dmg`` file name (never the QuodeqBar DMG).
"""
from __future__ import annotations

from pathlib import PurePosixPath
from urllib.parse import urlparse

from quodeq.shared.constants import SCHEME_HTTPS

_ASSET_PREFIX = "Quodeq-"
_ASSET_SUFFIX = "-macOS.dmg"
_ASSET_HOST = "github.com"
_ASSET_PATH_PREFIX = "/quodeq/quodeq/releases/download/"


def is_dashboard_dmg_url(download_url: str | None) -> bool:
    """True when *download_url* is the dashboard DMG of a quodeq GitHub release."""
    if not download_url:
        return False
    parsed = urlparse(download_url)
    if (parsed.scheme, parsed.hostname) != (SCHEME_HTTPS, _ASSET_HOST):
        return False
    if parsed.username or parsed.port or not parsed.path.startswith(_ASSET_PATH_PREFIX):
        return False
    name = PurePosixPath(parsed.path).name
    return name.startswith(_ASSET_PREFIX) and name.endswith(_ASSET_SUFFIX)
