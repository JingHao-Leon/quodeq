"""reset_clone_to_remote: the clone drops commits a failed push left behind."""
import subprocess

from quodeq.data.fs.shared_clone_reset import reset_clone_to_remote
from quodeq.data.fs.shared_repo import ensure_shared_clone, shared_repo_path


def _git(*args, cwd):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def _setup(tmp_path, monkeypatch, seeded=True):
    monkeypatch.setenv("QUODEQ_CACHE_ROOT", str(tmp_path / "cache"))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t@t")
    bare = tmp_path / "r.git"
    _git("init", "--bare", "-q", str(bare), cwd=tmp_path)
    url = f"file://{bare}"
    if seeded:
        seed = tmp_path / "seed"
        _git("clone", "-q", url, str(seed), cwd=tmp_path)
        (seed / "a.txt").write_text("a", encoding="utf-8")
        _git("add", "-A", cwd=seed)
        _git("commit", "-qm", "seed", cwd=seed)
        _git("push", "-q", "origin", "HEAD", cwd=seed)
    repo = ensure_shared_clone(url)
    if seeded:
        _git("fetch", "-q", "origin", "HEAD", cwd=repo)
    (repo / "unpushed.txt").write_text("x", encoding="utf-8")
    _git("add", "-A", cwd=repo)
    _git("commit", "-qm", "unpushed", cwd=repo)
    return url, repo, bare


def test_a_reachable_remote_resets_the_clone(tmp_path, monkeypatch):
    url, repo, _ = _setup(tmp_path, monkeypatch)
    reset_clone_to_remote(url)
    assert not (repo / "unpushed.txt").exists() and (repo / "a.txt").exists()


def test_an_unreachable_remote_falls_back_to_the_last_fetch(tmp_path, monkeypatch):
    url, repo, bare = _setup(tmp_path, monkeypatch)
    bare.rename(tmp_path / "gone.git")
    reset_clone_to_remote(url)
    assert not (repo / "unpushed.txt").exists() and (repo / "a.txt").exists()


def test_an_empty_remote_removes_the_clone(tmp_path, monkeypatch):
    url, _repo, _ = _setup(tmp_path, monkeypatch, seeded=False)
    reset_clone_to_remote(url)
    assert not shared_repo_path(url).exists()
