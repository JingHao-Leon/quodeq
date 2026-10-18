"""Finding-detail lookup from a run's legacy ``evaluation/<dim>.json`` files.

The SQL twin is ``quodeq.data.sqlite.findings_queries.read_finding_details``
(the ``findings`` table); this reader serves runs that pre-date the
event-log scoring engine and so never produced that table.
"""
from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from quodeq.core.finding_identity import coerce_line, finding_dismiss_keys
from quodeq.data.fs.report_parser.report_files import list_report_files, read_report_json, report_file

# A run's folder of per-dimension scored reports.
_EVAL_DIR = "evaluation"


def iter_eval_reports(eval_dir: Path, *, skip_corrupt: bool = False) -> Iterator[tuple[str, dict]]:
    """Yield ``(dimension, data)`` for every ``<dim>.json`` (or packed
    ``<dim>.json.gz``) file in *eval_dir*, in dimension order.

    Malformed JSON propagates by default -- a corrupt evaluation report is a
    bug in the run, not something callers should silently skip over.
    ``skip_corrupt=True`` instead skips just that one file and continues
    with the rest, for callers (e.g. the assistant's finding-identity index)
    that must keep serving every healthy dimension even when one report is
    truncated or corrupt -- a known failure mode of deadline-cut runs.
    """
    for dimension, path in list_report_files(eval_dir):
        if skip_corrupt:
            try:
                data = read_report_json(path)
            except (OSError, EOFError, ValueError):
                continue
            yield dimension, data
        else:
            yield dimension, read_report_json(path)


def iter_readable_eval_reports(run_dir: Path) -> Iterator[tuple[str, object]]:
    """Yield ``(dimension, data)`` for each readable ``evaluation/<dim>.json`` (or packed) in *run_dir*.

    Dimension order. A file that
    cannot be read or is not valid JSON is skipped; ``data`` is whatever the
    JSON holds, so callers that need an object check for one. No
    ``evaluation/`` directory yields nothing.
    """
    for dimension, path in list_report_files(run_dir / _EVAL_DIR):
        try:
            data = read_report_json(path)
        except (OSError, EOFError, ValueError):
            continue
        yield dimension, data


def eval_report_dimensions(run_dir: Path) -> list[str]:
    """Sorted dimensions of *run_dir*'s ``evaluation/<dim>.json`` files, from their names alone.

    Nothing is read, so a corrupt file is listed too; callers that need only
    readable reports use ``iter_readable_eval_reports``. No ``evaluation/``
    directory gives an empty list.
    """
    return [dimension for dimension, _ in list_report_files(run_dir / _EVAL_DIR)]


def read_eval_report(eval_dir: Path, dimension: str) -> dict | None:
    """Read the single ``<dimension>.json`` report from *eval_dir*, or
    ``None`` if it doesn't exist. Malformed JSON propagates."""
    path = report_file(eval_dir, dimension)
    if path is None:
        return None
    return read_report_json(path)


def read_finding_details_from_json_eval(
    run_dir: Path, keys: set[tuple],
) -> dict[tuple, dict]:
    """Return finding-detail dicts for the dismiss *keys* found in
    *run_dir*'s ``evaluation/*.json`` files.

    A key is ``(req, file, line)`` or ``(req, file, snippet fingerprint)``
    and a violation matches on any identity a dismissal of it may have been
    recorded under (``finding_dismiss_keys``), the same rule as the SQL twin
    in ``findings_queries``. Keys not present are simply absent from the
    result; the first file mentioning a key wins. ``dimension`` comes from
    the filename so the entry stays linked to its standard. Unreadable files
    are skipped, and so is a report (or a violation entry) that is valid JSON
    but not an object: a truncated or hand-edited run must not take the
    lookup down for every other dimension.
    """
    wanted = set(keys)
    out: dict[tuple, dict] = {}
    for dimension, data in iter_readable_eval_reports(run_dir):
        if not isinstance(data, dict):
            continue
        for v in (data.get("violations") or []):
            if not isinstance(v, dict):
                continue
            req = str(v.get("req") or "")
            file = str(v.get("file") or "")
            line = coerce_line(v.get("line") or 0)
            hits = finding_dismiss_keys(
                req=req, principle=v.get("principle") or v.get("practiceId"),
                file=file, line=line, snippet=v.get("snippet"),
            ) & wanted
            hits.difference_update(out)
            if not hits:
                continue
            detail = {
                "req": req, "file": file, "line": line,
                "dimension": dimension, "principle": v.get("principle") or "",
                "severity": v.get("severity") or "", "title": v.get("title") or "",
                "reason": v.get("reason") or "", "snippet": v.get("snippet") or "",
                "context": v.get("context") or "", "scope": v.get("scope") or "",
                "endLine": coerce_line(v.get("end_line") or v.get("endLine") or 0),
                "reqRefs": v.get("req_refs") or v.get("reqRefs") or [],
            }
            for key in hits:
                out[key] = detail
    return out
