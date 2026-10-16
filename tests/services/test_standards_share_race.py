"""Two machines share at once: B's push is rejected because A pushed first, then B rebases."""
import subprocess

import pytest

from quodeq.data.fs.shared_repo import shared_repo_path
from quodeq.services import standards_share_ops as ops
from quodeq.services.wiring_sync import read_shared_standards
from tests.services._standards_share_fixtures import (  # noqa: F401 -- remote is a fixture
    _share_at, _clone, _evaluator, _listed_state, remote,
)

_AT = "2026-10-16T10:00:00Z"


def _race(tmp_path, url, monkeypatch, b_id):
    """Machine A shares ``x`` from inside B's push, after B's refresh; then B's real push runs."""
    ev_a, ev_b = tmp_path / "a", tmp_path / "b"
    _evaluator(ev_a, "seed")
    _share_at("seed", url, ev_a, _AT)
    _evaluator(ev_a, "x", name="fromA")
    _evaluator(ev_b, b_id, name="fromB")
    real = ops.push_with_rebase_fallback

    def _racing(repo, env=None):
        monkeypatch.setattr(ops, "push_with_rebase_fallback", real)
        monkeypatch.setenv("QUODEQ_CACHE_ROOT", str(tmp_path / "cache"))
        _share_at("x", url, ev_a, _AT)
        monkeypatch.setenv("QUODEQ_CACHE_ROOT", str(tmp_path / "cache-b"))
        real(repo, env)

    monkeypatch.setenv("QUODEQ_CACHE_ROOT", str(tmp_path / "cache-b"))
    monkeypatch.setattr(ops, "push_with_rebase_fallback", _racing)
    return ev_b


def _remote_names(url, tmp_path):
    return {sid: data["name"] for sid, data in read_shared_standards(_clone(url, tmp_path / "check") / "standards").items()}


def test_different_ids_both_survive_the_rebase(tmp_path, remote, monkeypatch):
    ev_b = _race(tmp_path, remote, monkeypatch, "y")
    _share_at("y", remote, ev_b, _AT)
    assert _remote_names(remote, tmp_path) == {"seed": "seed", "x": "fromA", "y": "fromB"}
    assert _listed_state(ev_b, remote, "y") == "published"


def test_the_same_id_is_a_git_error_and_keeps_the_first_copy(tmp_path, remote, monkeypatch):
    ev_b = _race(tmp_path, remote, monkeypatch, "x")
    with pytest.raises(ops.ShareError) as err:
        _share_at("x", remote, ev_b, _AT)
    assert err.value.code == "git"
    assert _remote_names(remote, tmp_path)["x"] == "fromA"
    clone_b = shared_repo_path(remote)
    assert not (clone_b / ".git" / "rebase-merge").exists()
    status = subprocess.run(["git", "status", "--porcelain"], cwd=clone_b, capture_output=True, text=True)
    assert status.stdout == ""
    assert _listed_state(ev_b, remote, "x") not in ("published", None)
