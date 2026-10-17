"""An imported archived run keeps an archive without a database; an unsafe archive drops only that run."""
from __future__ import annotations

import io
import tarfile
import zipfile
from pathlib import Path

from quodeq.core.observability import NULL_LOG
from quodeq.data.fs.run_archive import ARCHIVE_FILENAME
from quodeq.services.project_import import safe_extract


def normalize_archived_runs(project: Path, *, log=NULL_LOG) -> None:
    """Re-import *project* in place through a zip, the way a pull lands it."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for path in sorted(p for p in project.rglob("*") if p.is_file()):
            zf.write(path, path.relative_to(project.parent).as_posix())
    for path in sorted(project.rglob("*"), reverse=True):
        path.unlink() if path.is_file() else path.rmdir()
    project.rmdir()
    with zipfile.ZipFile(buf) as zf:
        safe_extract(zf, {i.filename: i for i in zf.infolist()}, project.parent, log=log)


def _pack(run: Path, files: dict[str, bytes]) -> Path:
    run.mkdir(parents=True)
    (run / "status.json").write_text('{"state": "done"}')
    archive = run / ARCHIVE_FILENAME
    with tarfile.open(archive, "w:gz") as tar:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return archive


def _names(archive: Path) -> list[str]:
    with tarfile.open(archive, "r:gz") as tar:
        return tar.getnames()


def test_an_imported_archive_loses_its_database(tmp_path):
    archive = _pack(tmp_path / "proj" / "run-a", {
        "events.jsonl": b"{}\n", "evaluation.db": b"planted", "evidence/security_evidence.jsonl": b"{}\n",
    })
    normalize_archived_runs(tmp_path / "proj")
    assert sorted(_names(archive)) == ["events.jsonl", "evidence/security_evidence.jsonl"]
    assert [p.name for p in archive.parent.iterdir() if p.name.startswith(".")] == []


def test_an_unsafe_archive_drops_only_its_run(tmp_path):
    _pack(tmp_path / "proj" / "run-bad", {"evidence/security_evidence.jsonl": b"{}\n"})  # no event log
    good = _pack(tmp_path / "proj" / "run-good", {"events.jsonl": b"{}\n"})
    lines: list[str] = []

    class _Sink:
        def warning(self, message: str) -> None:
            lines.append(message)

        def __getattr__(self, name):
            return lambda *_a, **_k: None

    normalize_archived_runs(tmp_path / "proj", log=_Sink())
    assert not (tmp_path / "proj" / "run-bad").exists()
    assert _names(good) == ["events.jsonl"]
    assert any("run-bad" in line for line in lines)
