"""Tests for PUT /api/projects/<project_id>/standards-overrides?dryRun and changedDimensions."""
import json
from pathlib import Path

from tests.api._standards_overrides_fixtures import (  # noqa: F401 -- pytest fixtures
    _LOCALHOST,
    OVERRIDES_URL,
    client,
    client_with_custom,
    machine_settings,
    project_root,
)


# ---------------------------------------------------------------------------
# dryRun impact preview and changedDimensions
# ---------------------------------------------------------------------------

def test_dry_run_reports_changed_dimension_without_writing(client, project_root: Path):
    resp = client.put(OVERRIDES_URL + "?dryRun=true",
                      json={"overrides": {"M-ANA-2": {"max_lines": 60}}}, headers=_LOCALHOST)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["changedDimensions"] == ["maintainability"]
    assert not machine_settings().exists()


def test_dry_run_override_equal_to_default_reports_no_change(client, project_root: Path):
    resp = client.put(OVERRIDES_URL + "?dryRun=true",
                      json={"overrides": {"M-ANA-2": {"max_lines": 50}}}, headers=_LOCALHOST)
    assert resp.status_code == 200
    assert resp.get_json()["changedDimensions"] == []


def test_dry_run_validates_like_real_put(client):
    resp = client.put(OVERRIDES_URL + "?dryRun=true",
                      json={"overrides": {"M-ANA-2": {"max_lines": 9}}}, headers=_LOCALHOST)
    assert resp.status_code == 400


def test_real_put_returns_changed_dimensions_and_writes(client, project_root: Path):
    resp = client.put(OVERRIDES_URL,
                      json={"overrides": {"M-ANA-2": {"max_lines": 60}}}, headers=_LOCALHOST)
    assert resp.status_code == 200
    assert resp.get_json()["changedDimensions"] == ["maintainability"]
    assert machine_settings().exists()


def test_clearing_overrides_reports_reverted_dimension(client):
    client.put(OVERRIDES_URL, json={"overrides": {"M-ANA-2": {"max_lines": 60}}},
               headers=_LOCALHOST)
    resp = client.put(OVERRIDES_URL, json={"overrides": {}}, headers=_LOCALHOST)
    assert resp.status_code == 200
    assert resp.get_json()["changedDimensions"] == ["maintainability"]
    assert client.get(OVERRIDES_URL).get_json()["overrides"] == {}


def test_evaluator_only_override_not_in_changed_dimensions(client_with_custom, project_root: Path):
    """Evaluator-dir-only standards never shift cache keys, so overrides for them
    never appear in changedDimensions, matching dimension_params_state's scope."""
    resp = client_with_custom.put(
        OVERRIDES_URL,
        json={"overrides": {"CUST-1": {"max_items": 50}}},
        headers=_LOCALHOST,
    )
    assert resp.status_code == 200
    assert resp.get_json()["changedDimensions"] == []
    saved = json.loads(machine_settings().read_text())
    assert saved["overrides"]["CUST-1"] == {"max_items": 50}
