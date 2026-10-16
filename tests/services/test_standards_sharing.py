from quodeq.services.standards_sharing import SyncState, share_hash, shareable_payload, sync_state

BASE = {"id": "a", "name": "A", "principles": [{"id": "P1"}], "createdAt": "2026-10-01",
        "updatedAt": "2026-10-02", "version": "2026.10.02", "managed": False, "origin": None}


def _local(**over):
    data = {**BASE, **over}
    return data


def _shared(data):
    return {**shareable_payload(data), "publishedAt": "2026-10-03T10:00:00Z"}


def test_shareable_payload_drops_machine_keys_only():
    out = shareable_payload({**BASE, "shared_hash": "x", "origin_hash": "y"})
    assert "shared_hash" not in out and "managed" not in out and "origin" not in out
    assert out["createdAt"] == "2026-10-01" and out["version"] == "2026.10.02"


def test_hash_ignores_dates_version_publishing_and_machine_keys():
    a = share_hash(BASE)
    b = share_hash({**BASE, "updatedAt": "2027-01-01", "version": "x", "publishedAt": "y", "shared_hash": "z"})
    assert a == b
    assert share_hash({**BASE, "name": "B"}) != a


def test_never_shared_and_remote_only():
    assert sync_state(_local(), None) is SyncState.NEVER_SHARED
    assert sync_state(None, _shared(BASE)) is SyncState.REMOTE_ONLY
    assert sync_state(None, None) is None


def test_published_changed_update_diverged():
    base = share_hash(BASE)
    assert sync_state(_local(shared_hash=base), _shared(BASE)) is SyncState.PUBLISHED
    assert sync_state(_local(shared_hash=base, name="mine"), _shared(BASE)) is SyncState.CHANGED
    assert sync_state(_local(shared_hash=base), _shared({**BASE, "name": "theirs"})) is SyncState.UPDATE_AVAILABLE
    assert sync_state(_local(shared_hash=base, name="mine"), _shared({**BASE, "name": "theirs"})) is SyncState.DIVERGED


def test_removed_remotely_and_same_content_without_base():
    assert sync_state(_local(shared_hash="anything"), None) is SyncState.REMOVED_REMOTELY
    assert sync_state(_local(), _shared(BASE)) is SyncState.PUBLISHED
    assert sync_state(_local(name="mine"), _shared(BASE)) is SyncState.DIVERGED


def test_hash_ignores_keys_an_install_drops_and_key_order():
    plain = {"id": "a", "name": "A", "weight": 1.0, "principles": [{"name": "P", "requirements": [{"id": "R", "text": "t"}]}]}
    noisy = {"originHash": None, "subtype": None, "sources": [], "type": "custom", **plain}
    reordered = dict(reversed(list(plain.items())))
    assert share_hash(noisy) == share_hash(plain) == share_hash(reordered)
    assert share_hash({**plain, "weight": 2.0}) != share_hash(plain)


def test_weight_hashes_as_a_float_with_the_editor_default():
    plain = {"id": "a", "name": "A", "principles": []}
    same = {share_hash({**plain, "weight": w}) for w in (1, 1.0, True, "heavy")} | {share_hash(plain)}
    assert len(same) == 1
    assert share_hash({**plain, "weight": 2}) != share_hash(plain)
