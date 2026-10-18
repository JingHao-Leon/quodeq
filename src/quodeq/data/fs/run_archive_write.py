"""Write a run's archive to a temporary file and verify it holds exactly the files it was given."""
from __future__ import annotations

import hashlib
import os
import tarfile
from pathlib import Path

from quodeq.data.fs.run_archive_limits import RunArchiveError

_CHUNK = 1 << 20


def write_archive(tmp: Path, sources: list[tuple[str, Path]]) -> None:
    """Write *sources* into *tmp* as a gzip tar and fsync it to disk."""
    with open(tmp, "wb") as raw:
        with tarfile.open(fileobj=raw, mode="w:gz") as tar:
            for name, path in sources:
                tar.add(path, arcname=name, recursive=False)
        raw.flush()
        os.fsync(raw.fileno())


def _digest(stream) -> str:
    sha = hashlib.sha256()
    for chunk in iter(lambda: stream.read(_CHUNK), b""):
        sha.update(chunk)
    return sha.hexdigest()


def verify_archive(tmp: Path, sources: list[tuple[str, Path]]) -> None:
    """Reopen *tmp* and check it holds exactly *sources*, byte for byte."""
    expected = {}
    for name, path in sources:
        with open(path, "rb") as fh:
            expected[name] = (path.stat().st_size, _digest(fh))
    found = {}
    with tarfile.open(tmp, "r:gz") as tar:
        for member in tar:
            stream = tar.extractfile(member) if member.isreg() else None
            if stream is None:
                raise RunArchiveError(f"archive member {member.name!r} is not a regular file")
            found[member.name] = (member.size, _digest(stream))
    if found != expected:
        raise RunArchiveError("archive contents do not match the run's files")
