"""Bare-repo remote and evaluator-file builders for the standards sharing tests."""
import json
import subprocess

import pytest


def _git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


@pytest.fixture()
def remote(tmp_path, monkeypatch):
    """A local bare repo as the shared remote, with git identity and a sandboxed clone cache."""
    bare = tmp_path / "remote.git"
    _git("init", "--bare", str(bare), cwd=tmp_path)
    monkeypatch.setenv("QUODEQ_CACHE_ROOT", str(tmp_path / "cache"))
    for var, value in (("GIT_AUTHOR_NAME", "t"), ("GIT_AUTHOR_EMAIL", "t@t"),
                       ("GIT_COMMITTER_NAME", "t"), ("GIT_COMMITTER_EMAIL", "t@t")):
        monkeypatch.setenv(var, value)
    return f"file://{bare}"


def _evaluator(evaluators, sid, **extra):
    evaluators.mkdir(parents=True, exist_ok=True)
    data = {"id": sid, "name": sid, "type": "custom", "managed": False,
            "principles": [{"id": "P1", "name": "P", "requirements": [{"id": "P1-R1", "text": "t"}]}],
            "createdAt": "2026-10-01", "updatedAt": "2026-10-01", "version": "2026.10.01", **extra}
    (evaluators / f"{sid}.json").write_text(json.dumps(data), encoding="utf-8")
    return data


def _local(evaluators, sid):
    return json.loads((evaluators / f"{sid}.json").read_text())


def _clone(remote_url, dest):
    """A fresh clone of *remote_url* at *dest*, to inspect what was pushed."""
    _git("clone", remote_url, str(dest), cwd=dest.parent)
    return dest


def _listed_state(evaluators, remote_url, sid):
    """*sid*'s sync state as the standards listing shows it, read from this machine's clone."""
    from quodeq.services.standards import StandardsService
    from quodeq.services.wiring_sync import read_shared_standards, shared_standards_dir

    dims = evaluators.parent / "dims.json"
    dims.write_text('{"applies": []}', encoding="utf-8")
    svc = StandardsService(evaluators, evaluators.parent / "compiled", dims,
                           shared_standards=lambda: read_shared_standards(shared_standards_dir(remote_url)))
    return {m.id: m.sync_state for m in svc.list_standards()}.get(sid)


def _push_from_second_clone(remote_url, dest, edit):
    """Clone *remote_url* at *dest*, let *edit(dest)* change it, then commit and push everything."""
    _clone(remote_url, dest)
    edit(dest)
    _git("add", "-A", cwd=dest)
    _git("commit", "-m", "edit from a second clone", cwd=dest)
    _git("push", "origin", "HEAD", cwd=dest)


def _share_at(sid, url, evaluators, at, **kw):
    """``share_standard`` with its clock pinned to *at*."""
    from quodeq.services import standards_share_ops as ops

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(ops, "now_utc_iso", lambda: at)
        return ops.share_standard(sid, url=url, evaluators_dir=evaluators, **kw)
