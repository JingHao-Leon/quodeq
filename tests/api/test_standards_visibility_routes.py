"""Tests for GET/PUT /api/projects/<project_id>/standards-visibility."""
import json
from pathlib import Path

import pytest

from quodeq.api.app import create_app
from quodeq.shared.env_paths import get_evaluations_dir, get_quodeq_dir
from quodeq.core.standards.visibility import DEFAULT_VISIBLE_STANDARDS, VISIBILITY_RELPATH

# PUT is a state-changing request; the CSRF check in quodeq.api.security
# requires a same-origin Origin header on it (see
# tests/api/test_standards_overrides_routes.py's identical _LOCALHOST use).
_LOCALHOST = {"Origin": "http://localhost"}


@pytest.fixture()
def project_id() -> str:
    return "proj-1"


@pytest.fixture()
def repo_root(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    return root


def _register(pid: str, repo: Path) -> None:
    """Record *repo* as the local clone of *pid* under the sandboxed evaluations dir."""
    info = Path(get_evaluations_dir()) / pid / "repository_info.json"
    info.parent.mkdir(parents=True, exist_ok=True)
    info.write_text(json.dumps({"name": "p", "path": str(repo)}), encoding="utf-8")


@pytest.fixture()
def local_project(repo_root: Path, project_id: str):
    _register(project_id, repo_root)
    return project_id, repo_root


@pytest.fixture()
def local_project_with_repo_file(repo_root: Path, project_id: str):
    _register(project_id, repo_root)
    legacy = repo_root / VISIBILITY_RELPATH
    legacy.parent.mkdir(parents=True, exist_ok=True)
    legacy.write_text(json.dumps({"version": 1, "visibleStandardIds": ["security"]}), encoding="utf-8")
    return project_id, repo_root


@pytest.fixture()
def client():
    """A test client with no STANDARDS_* overrides, so knownStandardIds comes
    from the real bundled compiled standards (security, clean-architecture,
    etc.) -- unlike test_standards_overrides_routes.py's client, which stubs
    a tiny compiled dir because it only cares about override validation
    against specific params, not the full known-id catalog.
    """
    app = create_app(test_config={"TESTING": True})

    with app.test_client() as c:
        yield c


def test_get_returns_defaults_when_no_file(client, project_id):
    resp = client.get(f"/api/projects/{project_id}/standards-visibility")
    assert resp.status_code == 200
    assert resp.get_json()["visibleStandardIds"] == list(DEFAULT_VISIBLE_STANDARDS)
    assert resp.get_json()["isDefault"] is True


def test_get_reports_default_standard_ids(client, project_id):
    """Additive `defaultStandardIds` lets the UI reconcile its boot-time
    fallback against the server's own default set instead of duplicating
    it as a second source of truth."""
    body = client.get(f"/api/projects/{project_id}/standards-visibility").get_json()
    assert body["defaultStandardIds"] == list(DEFAULT_VISIBLE_STANDARDS)


def test_get_reports_known_standard_ids(client, project_id):
    body = client.get(f"/api/projects/{project_id}/standards-visibility").get_json()
    assert "security" in body["knownStandardIds"]
    assert "clean-architecture" in body["knownStandardIds"]


def test_put_persists_and_get_reads_back(client, project_id, repo_root):
    resp = client.put(f"/api/projects/{project_id}/standards-visibility",
                       json={"visibleStandardIds": ["security", "clean-architecture"]},
                       headers=_LOCALHOST)
    assert resp.status_code == 200
    assert resp.get_json()["isDefault"] is False
    saved = json.loads((get_quodeq_dir() / "projects" / project_id / "standards.json").read_text(encoding="utf-8"))
    assert saved["enabled"] == ["security", "clean-architecture"]
    assert not (repo_root / VISIBILITY_RELPATH).exists()
    again = client.get(f"/api/projects/{project_id}/standards-visibility").get_json()
    assert again["visibleStandardIds"] == ["security", "clean-architecture"]


def test_put_rejects_unknown_standard(client, project_id, repo_root):
    resp = client.put(f"/api/projects/{project_id}/standards-visibility",
                       json={"visibleStandardIds": ["not-a-standard"]},
                       headers=_LOCALHOST)
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "invalid_visibility"
    assert not (get_quodeq_dir() / "projects" / project_id / "standards.json").exists()


def test_put_rejects_missing_key(client, project_id):
    resp = client.put(f"/api/projects/{project_id}/standards-visibility", json={},
                       headers=_LOCALHOST)
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "bad_request"


def test_put_accepts_empty_selection(client, project_id, repo_root):
    resp = client.put(f"/api/projects/{project_id}/standards-visibility",
                       json={"visibleStandardIds": []},
                       headers=_LOCALHOST)
    assert resp.status_code == 200
    assert resp.get_json()["visibleStandardIds"] == []
    assert (get_quodeq_dir() / "projects" / project_id / "standards.json").is_file()


def test_put_computes_known_ids_once(client, project_id, monkeypatch):
    import quodeq.api.standards_visibility_routes as _mod
    real_known_ids = _mod._known_ids
    calls = {"n": 0}

    def counting(app):
        calls["n"] += 1
        return real_known_ids(app)

    monkeypatch.setattr(_mod, "_known_ids", counting)

    resp = client.put(f"/api/projects/{project_id}/standards-visibility",
                       json={"visibleStandardIds": ["security"]},
                       headers=_LOCALHOST)
    assert resp.status_code == 200
    assert calls["n"] == 1, "the PUT must list all standards only once"


def test_put_then_get_writes_machine_file_not_repo(client, local_project):
    pid, repo = local_project
    resp = client.put(f"/api/projects/{pid}/standards-visibility",
                      json={"visibleStandardIds": ["security"]}, headers=_LOCALHOST)
    assert resp.status_code == 200
    assert not (repo / ".quodeq" / "standards-visibility.json").exists()
    assert client.get(f"/api/projects/{pid}/standards-visibility").json["visibleStandardIds"] == ["security"]


def test_unknown_or_shared_project_gets_defaults_and_can_save(client):
    resp = client.get("/api/projects/not-local-uuid/standards-visibility")
    assert resp.status_code == 200 and resp.json["isDefault"] is True
    put = client.put("/api/projects/not-local-uuid/standards-visibility",
                     json={"visibleStandardIds": ["security"]}, headers=_LOCALHOST)
    assert put.status_code == 200 and put.json["visibleStandardIds"] == ["security"]


def test_get_keeps_the_legacy_repo_selection(client, local_project_with_repo_file):
    pid, _repo = local_project_with_repo_file
    assert client.get(f"/api/projects/{pid}/standards-visibility").json["visibleStandardIds"] == ["security"]
