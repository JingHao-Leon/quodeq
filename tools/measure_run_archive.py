#!/usr/bin/env python3
"""Measure archive, restore and database rebuild on a COPY of a project's runs.

Usage: uv run python tools/measure_run_archive.py <copy-of-a-project-dir> [--runs N]

Make the copy first (``cp -cR`` is an instant APFS clone) and point the
QUODEQ_* store variables at the scratch folder. The tool refuses any path
under the real ``~/.quodeq``. It archives the N largest runs, then restores
each (``restore_s``: the restore readers pay, ``evaluation.db`` included).
``rebuild_s`` then deletes the restored database and times the first
projection, the rebuild a restore would cost if the database were not kept
in the archive (the measure behind keeping it there).
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from quodeq.data.fs.run_archive import archive_run, ensure_restored
from quodeq.data.projection.projector import Projector

_REAL_STORE = Path.home() / ".quodeq"
_DEFAULT_RUNS = 10
_MIB = 1024 * 1024
_DB_FILES = ("evaluation.db", "evaluation.db-wal", "evaluation.db-shm")


def _is_under(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def _run_size(run_dir: Path) -> int:
    files = [run_dir / "events.jsonl", *(run_dir / "evidence").glob("*_evidence.jsonl")]
    return sum(f.stat().st_size for f in files if f.is_file())


def _largest_runs(project_dir: Path, count: int) -> list[Path]:
    runs = [d for d in project_dir.iterdir() if (d / "events.jsonl").is_file()]
    return sorted(runs, key=_run_size, reverse=True)[:count]


def _measure(run_dir: Path) -> tuple[str, float, float, float, int, int]:
    t0 = time.perf_counter()
    result = archive_run(run_dir)
    t1 = time.perf_counter()
    ensure_restored(run_dir)
    restore_s = time.perf_counter() - t1
    for name in _DB_FILES:  # without this the projection is a no-op on the restored database
        (run_dir / name).unlink(missing_ok=True)
    t2 = time.perf_counter()
    Projector().ensure_projected(run_dir / "events.jsonl", run_dir, project_dir=run_dir.parent)
    rebuild_s = time.perf_counter() - t2
    return run_dir.name[:8], t1 - t0, restore_s, rebuild_s, result.bytes_before, result.bytes_after


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_dir", type=Path)
    parser.add_argument("--runs", type=int, default=_DEFAULT_RUNS)
    args = parser.parse_args(argv)
    project_dir = args.project_dir.expanduser().resolve()
    if _is_under(project_dir, _REAL_STORE.resolve()):
        print(f"refusing to touch the real store: {project_dir}", file=sys.stderr)
        return 2
    rows = [_measure(run) for run in _largest_runs(project_dir, args.runs)]
    print(f"{'run':8} {'archive_s':>9} {'restore_s':>9} {'rebuild_s':>9} {'before_MiB':>10} {'after_MiB':>9}")
    for name, arch, rest, rebuild, before, after in rows:
        print(f"{name:8} {arch:9.2f} {rest:9.2f} {rebuild:9.2f} {before / _MIB:10.1f} {after / _MIB:9.1f}")
    print(
        f"TOTAL    {sum(r[1] for r in rows):9.2f} {sum(r[2] for r in rows):9.2f} "
        f"{sum(r[3] for r in rows):9.2f} {sum(r[4] for r in rows) / _MIB:10.1f} "
        f"{sum(r[5] for r in rows) / _MIB:9.1f}"
    )
    if rows:
        worst = max(rows, key=lambda r: r[4])
        print(f"biggest run {worst[0]}: restore {worst[2]:.2f} s, rebuild without the kept database {worst[3]:.2f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
