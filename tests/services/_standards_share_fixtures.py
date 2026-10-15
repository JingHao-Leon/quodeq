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
            "principles": [{"name": "P", "requirements": [{"id": "P1-R1", "text": "t"}]}],
            "createdAt": "2026-10-01", "updatedAt": "2026-10-01", "version": "2026.10.01", **extra}
    (evaluators / f"{sid}.json").write_text(json.dumps(data), encoding="utf-8")
    return data


def _local(evaluators, sid):
    return json.loads((evaluators / f"{sid}.json").read_text())


def _clone(remote_url, dest):
    """A fresh clone of *remote_url* at *dest*, to inspect what was pushed."""
    _git("clone", remote_url, str(dest), cwd=dest.parent)
    return dest
