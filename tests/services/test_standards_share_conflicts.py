"""Share and update never overwrite the other side silently; a failed push leaves the clone at the remote."""
import json

import pytest

from quodeq.data.fs.shared_repo import refresh_shared_clone
from quodeq.services import shared_publish
from quodeq.services import standards_share_ops as ops
from quodeq.services.standards_sharing import share_hash
from quodeq.services.wiring_sync import read_shared_standards, shared_standards_dir
from tests.services._standards_share_fixtures import (  # noqa: F401 -- remote is a fixture
    _share_at, _evaluator, _listed_state, _local, remote,
)

_AT = "2026-10-16T10:00:00Z"
_REAL_RUN_GIT = shared_publish.run_git


def _share(sid, url, ev, **kw):
    return _share_at(sid, url, ev, _AT, **kw)


def _theirs_on_remote(tmp_path, url, monkeypatch, sid="go", force=True):
    """Machine B pushes its own *sid*; machine A's clone is refreshed afterwards."""
    monkeypatch.setenv("QUODEQ_CACHE_ROOT", str(tmp_path / "cache-b"))
    _evaluator(tmp_path / "b", sid, name="theirs")
    _share(sid, url, tmp_path / "b", force=force)
    monkeypatch.setenv("QUODEQ_CACHE_ROOT", str(tmp_path / "cache"))
    refresh_shared_clone(url)


def _shared_name(url, sid):
    return read_shared_standards(shared_standards_dir(url))[sid]["name"]


def test_share_refuses_when_the_shared_copy_moved_on(tmp_path, remote, monkeypatch):
    ev = tmp_path / "a"
    _evaluator(ev, "go")
    _share("go", remote, ev)
    _theirs_on_remote(tmp_path, remote, monkeypatch)
    for force in (False, True):
        with pytest.raises(ops.ShareError) as err:
            _share("go", remote, ev, force=force)
        assert err.value.code == "conflict" and "changed since you last pulled" in err.value.message
    assert _shared_name(remote, "go") == "theirs"


def test_share_of_a_diverged_copy_needs_force(tmp_path, remote, monkeypatch):
    ev = tmp_path / "a"
    _evaluator(ev, "go")
    _share("go", remote, ev)
    _theirs_on_remote(tmp_path, remote, monkeypatch)
    data = _local(ev, "go")
    (ev / "go.json").write_text(json.dumps({**data, "name": "mine"}), encoding="utf-8")
    with pytest.raises(ops.ShareError) as err:
        _share("go", remote, ev)
    assert err.value.code == "conflict" and _shared_name(remote, "go") == "theirs"
    _share("go", remote, ev, force=True)
    assert _shared_name(remote, "go") == "mine" and _listed_state(ev, remote, "go") == "published"


def test_update_is_a_no_op_when_already_published(tmp_path, remote):
    ev = tmp_path / "a"
    _evaluator(ev, "go")
    _share("go", remote, ev)
    before = (ev / "go.json").read_text()
    assert ops.update_from_shared("go", url=remote, evaluators_dir=ev) == {"id": "go", "warnings": []}
    assert (ev / "go.json").read_text() == before


@pytest.mark.parametrize("based", [True, False])
def test_update_over_local_changes_needs_force(tmp_path, remote, monkeypatch, based):
    ev = tmp_path / "a"
    _evaluator(ev, "go")
    _share("go", remote, ev)
    data = _local(ev, "go")
    if not based:
        data.pop("shared_hash")
    (ev / "go.json").write_text(json.dumps({**data, "name": "mine"}), encoding="utf-8")
    if based:
        _theirs_on_remote(tmp_path, remote, monkeypatch)  # diverged; unbased local is diverged already
    with pytest.raises(ops.ShareError) as err:
        ops.update_from_shared("go", url=remote, evaluators_dir=ev)
    assert err.value.code == "conflict" and "has local changes" in err.value.message
    assert _local(ev, "go")["name"] == "mine"
    ops.update_from_shared("go", url=remote, evaluators_dir=ev, force=True)
    assert _local(ev, "go")["name"] != "mine" and _listed_state(ev, remote, "go") == "published"


def test_update_over_a_changed_copy_needs_force(tmp_path, remote):
    ev = tmp_path / "a"
    _evaluator(ev, "go")
    _share("go", remote, ev)
    (ev / "go.json").write_text(json.dumps({**_local(ev, "go"), "name": "mine"}), encoding="utf-8")
    assert _listed_state(ev, remote, "go") == "changed"
    with pytest.raises(ops.ShareError) as err:
        ops.update_from_shared("go", url=remote, evaluators_dir=ev)
    assert err.value.code == "conflict"


def _failing_push(monkeypatch):
    real = shared_publish.run_git
    monkeypatch.setattr(shared_publish, "run_git",
                        lambda args, **kw: (False, "remote rejected") if args[0] == "push" else real(args, **kw))


def test_a_failed_push_leaves_the_clone_at_the_remote(tmp_path, remote, monkeypatch):
    ev = tmp_path / "a"
    _evaluator(ev, "go")
    _share("go", remote, ev)
    _evaluator(ev, "fresh")
    (ev / "go.json").write_text(json.dumps({**_local(ev, "go"), "name": "edited"}), encoding="utf-8")
    _failing_push(monkeypatch)
    for sid in ("go", "fresh"):
        with pytest.raises(ops.ShareError):
            _share(sid, remote, ev)
    assert _listed_state(ev, remote, "go") == "changed"
    assert _listed_state(ev, remote, "fresh") == "never_shared"
    assert _shared_name(remote, "go") == "go"
    assert ops.install_standard("go", url=remote, evaluators_dir=tmp_path / "c")["id"] == "go"
    with pytest.raises(ops.ShareError):
        ops.install_standard("fresh", url=remote, evaluators_dir=tmp_path / "c")


def test_a_failed_first_push_into_an_empty_repo_leaves_nothing_shared(tmp_path, remote, monkeypatch):
    ev = tmp_path / "a"
    _evaluator(ev, "go")
    _failing_push(monkeypatch)
    with pytest.raises(ops.ShareError):
        _share("go", remote, ev)
    assert _listed_state(ev, remote, "go") == "never_shared"
    assert not (shared_standards_dir(remote) / "go.json").exists()
    monkeypatch.setattr(shared_publish, "run_git", _REAL_RUN_GIT)
    _share("go", remote, ev)
    assert _listed_state(ev, remote, "go") == "published"


def test_install_of_a_shared_copy_that_cannot_be_hashed_is_invalid(tmp_path, remote, monkeypatch):
    _evaluator(tmp_path / "a", "go")
    _share("go", remote, tmp_path / "a")
    _evaluator(tmp_path / "b", "go", name="mine")

    def _broken(data):
        if data.get("name") == "go":
            raise TypeError("principles is not a list")
        return share_hash(data)
    monkeypatch.setattr(ops, "share_hash", _broken)
    with pytest.raises(ops.ShareError) as err:
        ops.install_standard("go", url=remote, evaluators_dir=tmp_path / "b")
    assert err.value.code == "invalid" and "not a valid standard" in err.value.message
