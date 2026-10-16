"""Self-update downloads only the dashboard DMG of a quodeq GitHub release."""
from __future__ import annotations

import pytest

from quodeq.update.release_asset import is_dashboard_dmg_url

_RELEASE = "https://github.com/quodeq/quodeq/releases/download/v1.11.0/"


def test_the_release_dmg_is_accepted():
    assert is_dashboard_dmg_url(_RELEASE + "Quodeq-1.11.0-macOS.dmg")


@pytest.mark.parametrize("url", [
    None,
    "",
    _RELEASE + "QuodeqBar-1.11.0-macOS.dmg",
    "https://example.com/Quodeq-1.11.0-macOS.dmg",
    "http://github.com/quodeq/quodeq/releases/download/v1.11.0/Quodeq-1.11.0-macOS.dmg",
    "https://github.com/evil/quodeq/releases/download/v1.11.0/Quodeq-1.11.0-macOS.dmg",
    "https://github.com.evil.test/quodeq/quodeq/releases/download/v1/Quodeq-1.11.0-macOS.dmg",
    "https://user@github.com/quodeq/quodeq/releases/download/v1/Quodeq-1.11.0-macOS.dmg",
    "https://github.com:8443/quodeq/quodeq/releases/download/v1/Quodeq-1.11.0-macOS.dmg",
])
def test_anything_else_is_refused(url):
    assert not is_dashboard_dmg_url(url)
