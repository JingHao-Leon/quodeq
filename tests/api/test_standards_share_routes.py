"""Tests for the share, install and update routes of custom standards."""
import json

import pytest

from quodeq.api.app import create_app
from quodeq.services.standards_share_ops import ShareError

_LOCALHOST = {"Origin": "http://localhost"}
_MOD = "quodeq.api.standards_share_routes"


@pytest.fixture()
def client(tmp_path):
    evaluators = tmp_path / "evaluators"
    evaluators.mkdir()
    compiled = tmp_path / "compiled"
    compiled.mkdir()
    dims = tmp_path / "dimensions.json"
    dims.write_text(json.dumps({"applies": [{"id": "security", "weight": 1.2, "iso_25010": "Security",
                                             "source": "ISO/IEC 25010:2023"}]}))
    (compiled / "security.json").write_text(json.dumps({"id": "security", "name": "Security", "principles": []}))
    app = create_app(test_config={
        "TESTING": True,
        "STANDARDS_EVALUATORS_DIR": str(evaluators),
        "STANDARDS_COMPILED_DIR": str(compiled),
        "STANDARDS_DIMENSIONS_FILE": str(dims),
    })
    with app.test_client() as c:
        yield c


def test_share_requires_a_connected_repo(client, monkeypatch):
    monkeypatch.setattr(f"{_MOD}.shared_url", lambda: None)
    resp = client.post("/api/standards/a/share", headers=_LOCALHOST)
    assert resp.status_code == 409 and resp.json["code"] == "shared_repo_not_connected"


def test_share_ok(client, monkeypatch):
    monkeypatch.setattr(f"{_MOD}.shared_url", lambda: "file:///x")
    monkeypatch.setattr(f"{_MOD}.share_standard",
                        lambda sid, **kw: {"id": sid, "publishedAt": "2026-10-16T10:00:00Z"})
    resp = client.post("/api/standards/a/share", headers=_LOCALHOST)
    assert resp.status_code == 200 and resp.json["publishedAt"] == "2026-10-16T10:00:00Z"


@pytest.mark.parametrize("op", ["install", "update"])
def test_install_and_update_ok(client, monkeypatch, op):
    monkeypatch.setattr(f"{_MOD}.shared_url", lambda: "file:///x")
    name = "install_standard" if op == "install" else "update_from_shared"
    monkeypatch.setattr(f"{_MOD}.{name}", lambda sid, **kw: {"id": sid, "warnings": []})
    resp = client.post(f"/api/standards/a/{op}", headers=_LOCALHOST)
    assert resp.status_code == 200 and resp.json == {"id": "a", "warnings": []}


@pytest.mark.parametrize(("code", "status"), [("not_found", 404), ("conflict", 409), ("unsafe", 422),
                                              ("invalid", 400), ("git", 502), ("builtin", 403)])
def test_errors_map_to_statuses(client, monkeypatch, code, status):
    monkeypatch.setattr(f"{_MOD}.shared_url", lambda: "file:///x")

    def boom(sid, **kw):
        raise ShareError(code, "message for the user")
    monkeypatch.setattr(f"{_MOD}.install_standard", boom)
    resp = client.post("/api/standards/a/install", headers=_LOCALHOST)
    assert resp.status_code == status and resp.json["error"] == "message for the user"


def test_ops_receive_a_builtin_check(client, monkeypatch):
    monkeypatch.setattr(f"{_MOD}.shared_url", lambda: "file:///x")
    seen = {}

    def spy(sid, **kw):
        seen["builtin"] = kw["is_builtin"]("security")
        seen["custom"] = kw["is_builtin"]("mine")
        return {"id": sid, "publishedAt": "t"}
    monkeypatch.setattr(f"{_MOD}.share_standard", spy)
    client.post("/api/standards/a/share", headers=_LOCALHOST)
    assert seen == {"builtin": True, "custom": False}


def test_share_of_a_builtin_is_forbidden(client, monkeypatch):
    monkeypatch.setattr(f"{_MOD}.shared_url", lambda: "file:///x")
    resp = client.post("/api/standards/security/share", headers=_LOCALHOST)
    assert resp.status_code == 403


def test_bad_id_is_a_400(client, monkeypatch):
    monkeypatch.setattr(f"{_MOD}.shared_url", lambda: "file:///x")
    resp = client.post("/api/standards/..%2Fx/share", headers=_LOCALHOST)
    assert resp.status_code in (400, 404)
