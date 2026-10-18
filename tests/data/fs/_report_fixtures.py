"""Builders for report tests: write a plain or packed report, pack a run's reports in place."""
from __future__ import annotations

import gzip
import json
import os
from pathlib import Path

from quodeq.data.fs.report_files import PACKED_REPORT_SUFFIX, REPORT_SUFFIX, list_report_files


def write_report(eval_dir: Path, dimension: str, payload: dict, *, packed: bool = False, mtime_ns: int | None = None) -> Path:
    """Write ``<dimension>.json`` (or ``.json.gz``) under *eval_dir*; the path written."""
    eval_dir.mkdir(parents=True, exist_ok=True)
    data = json.dumps(payload).encode("utf-8")
    path = eval_dir / f"{dimension}{PACKED_REPORT_SUFFIX if packed else REPORT_SUFFIX}"
    path.write_bytes(gzip.compress(data, 6) if packed else data)
    if mtime_ns is not None:
        os.utime(path, ns=(mtime_ns, mtime_ns))
    return path


def pack_reports(run_dir: Path) -> list[Path]:
    """Gzip every plain report of *run_dir* in place, mtime copied; the packed paths."""
    packed = []
    for dimension, path in list_report_files(run_dir / "evaluation"):
        if path.name.endswith(PACKED_REPORT_SUFFIX):
            continue
        dest = path.with_name(f"{dimension}{PACKED_REPORT_SUFFIX}")
        dest.write_bytes(gzip.compress(path.read_bytes(), 6))
        stamp = path.stat().st_mtime_ns
        os.utime(dest, ns=(stamp, stamp))
        path.unlink()
        packed.append(dest)
    return packed
