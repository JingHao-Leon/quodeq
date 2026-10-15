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
