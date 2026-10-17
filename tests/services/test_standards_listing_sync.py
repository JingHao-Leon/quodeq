import json

from quodeq.services.standards import StandardsService
from quodeq.services.standards_sharing import share_hash


def _svc(tmp_path, remote):
    ev = tmp_path / "ev"
    ev.mkdir()
    dims = tmp_path / "dims.json"
    dims.write_text('{"applies": []}', encoding="utf-8")
    return StandardsService(ev, tmp_path / "compiled", dims, shared_standards=lambda: remote), ev


def _write(ev, sid, **extra):
    data = {"id": sid, "name": sid, "type": "custom", "principles": [], **extra}
    (ev / f"{sid}.json").write_text(json.dumps(data), encoding="utf-8")
    return data


def _meta(svc):
    return {m.id: m for m in svc.list_standards()}


def test_not_connected_has_no_sync_and_no_remote_rows(tmp_path):
    svc, ev = _svc(tmp_path, None)
    _write(ev, "a")
    meta = _meta(svc)["a"]
    assert meta.sync_state is None and not meta.remote


def test_states_and_remote_only_rows(tmp_path):
    shared_a = {"id": "a", "name": "a", "type": "custom", "principles": [], "publishedAt": "2026-10-16T10:00:00Z"}
    remote = {"a": shared_a, "go": {"id": "go", "name": "Go", "principles": [], "publishedAt": "2026-10-03T09:00:00Z"}}
    svc, ev = _svc(tmp_path, remote)
    _write(ev, "a", shared_hash=share_hash(shared_a))
    _write(ev, "solo")
    metas = _meta(svc)
    assert (metas["a"].sync_state, metas["a"].published_at) == ("published", "2026-10-16T10:00:00Z")
    assert metas["solo"].sync_state == "never_shared"
    assert metas["go"].remote is True and metas["go"].sync_state == "remote_only"


def _builtin_svc(tmp_path, remote):
    svc, ev = _svc(tmp_path, remote)
    (tmp_path / "dims.json").write_text(
        '{"applies": [{"id": "security", "weight": 1.0, "source": "s"}]}', encoding="utf-8")
    return svc, ev


def test_remote_file_named_like_a_builtin_is_not_a_row(tmp_path):
    remote = {"security": {"id": "security", "name": "Evil", "principles": []}}
    svc, _ = _builtin_svc(tmp_path, remote)
    rows = [m for m in svc.list_standards() if m.id == "security"]
    assert len(rows) == 1 and not rows[0].remote and rows[0].sync_state is None


def test_malformed_remote_payloads_do_not_break_the_listing(tmp_path):
    remote = {"x": {"id": "x", "principles": "oops"}, "y": {"id": "y", "principles": []},
              "ok": {"id": "ok", "name": "Ok", "principles": []}}
    svc, ev = _svc(tmp_path, remote)
    _write(ev, "a")
    metas = _meta(svc)
    assert "ok" in metas and "a" in metas


def test_local_with_malformed_shared_copy_still_lists(tmp_path):
    svc, ev = _svc(tmp_path, {"a": {"id": "a", "principles": "oops"}})
    _write(ev, "a")
    assert _meta(svc)["a"].id == "a"


def test_an_evaluator_file_that_is_a_json_list_is_skipped(tmp_path):
    svc, ev = _svc(tmp_path, {})
    (ev / "broken.json").write_text("[1, 2]", encoding="utf-8")
    _write(ev, "ok")
    assert sorted(_meta(svc)) == ["ok"]
