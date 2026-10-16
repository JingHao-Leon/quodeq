"""A project publish restores the standards it scored, survives a broken shared copy and a failed push."""
import json

import pytest

from quodeq.services import shared_publish
from quodeq.services.wiring_sync import shared_standards_dir
from tests.services._standards_share_fixtures import (  # noqa: F401 -- remote is a fixture
    _share_at, _clone, _evaluator, _listed_state, _push_from_second_clone, remote,
)
from tests.services.test_shared_publish_standards import _DIRS, _run

_AT = "2026-10-16T10:00:00Z"


@pytest.fixture()
def scored_x(tmp_path):
    root = tmp_path / "evaluations"
    _run(root / "proj", "run-1", "done", ["x"])
    return root


def _shared_ids(check):
    return sorted(p.stem for p in (check / "standards").glob("*.json"))


def _delete_shared(dest, ids):
    for sid in ids:
        (dest / "standards" / f"{sid}.json").unlink()


def test_publish_brings_back_a_scored_standard_deleted_remotely(tmp_path, remote, scored_x, monkeypatch):
    ev = tmp_path / "evaluators"
    for sid in ("x", "y"):
        _evaluator(ev, sid)
        _share_at(sid, remote, ev, _AT)
    _push_from_second_clone(remote, tmp_path / "second", lambda dest: _delete_shared(dest, ["x", "y"]))
    monkeypatch.setattr(_DIRS, lambda: (None, ev))
    shared_publish.publish_project("proj", remote, evaluations_root=scored_x)
    assert _shared_ids(_clone(remote, tmp_path / "check")) == ["x"]


def test_a_shared_copy_that_cannot_be_compared_is_skipped(tmp_path, remote, scored_x, monkeypatch, caplog):
    ev = tmp_path / "evaluators"
    _evaluator(ev, "x")
    _share_at("x", remote, ev, _AT)
    (ev / "x.json").write_text(json.dumps({**json.loads((ev / "x.json").read_text()), "name": "new"}))
    monkeypatch.setattr(_DIRS, lambda: (None, ev))

    def _broken(local, shared):
        raise AttributeError("'str' object has no attribute 'get'")
    monkeypatch.setattr("quodeq.services._publish_standards.sync_state", _broken)
    skipped = []
    assert shared_publish.publish_project("proj", remote, evaluations_root=scored_x, on_skipped=skipped.extend) == 1
    assert skipped == ["x"] and "x" in caplog.text
    check = _clone(remote, tmp_path / "check")
    assert json.loads((check / "standards" / "x.json").read_text())["name"] == "x"
    assert (check / "evaluations" / "proj" / "run-1").is_dir()


def test_a_failed_project_push_leaves_the_clone_at_the_remote(tmp_path, remote, scored_x, monkeypatch):
    ev = tmp_path / "evaluators"
    _evaluator(ev, "seed")
    _share_at("seed", remote, ev, _AT)
    _evaluator(ev, "x")
    monkeypatch.setattr(_DIRS, lambda: (None, ev))
    real = shared_publish.run_git
    monkeypatch.setattr(shared_publish, "run_git",
                        lambda args, **kw: (False, "rejected") if args[0] == "push" else real(args, **kw))
    with pytest.raises(shared_publish.PublishError):
        shared_publish.publish_project("proj", remote, evaluations_root=scored_x)
    assert not (shared_standards_dir(remote) / "x.json").exists()
    assert _listed_state(ev, remote, "x") == "never_shared"


def test_a_standard_the_shared_folder_refuses_is_skipped_not_fatal(tmp_path, remote, scored_x, monkeypatch):
    def refuse(*_a, **_kw):
        raise ValueError("refusing to write through a symlink")

    ev = tmp_path / "evaluators"
    _evaluator(ev, "x")
    monkeypatch.setattr(_DIRS, lambda: (None, ev))
    monkeypatch.setattr("quodeq.services._publish_standards.write_shared_standard", refuse)
    skipped = []
    assert shared_publish.publish_project("proj", remote, evaluations_root=scored_x, on_skipped=skipped.extend) == 1
    assert skipped == ["x"]
    assert not (_clone(remote, tmp_path / "check") / "standards" / "x.json").exists()
