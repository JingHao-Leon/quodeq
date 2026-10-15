"""Created, updated, version and source metadata in the standards listing."""
import json
import os
from datetime import datetime

from quodeq.services.standards import StandardsService


def _service(tmp_path):
    evaluators = tmp_path / "evaluators"
    evaluators.mkdir()
    compiled = tmp_path / "compiled"
    compiled.mkdir()
    dims = tmp_path / "dimensions.json"
    dims.write_text(json.dumps({"applies": [{"id": "security", "name": "Security", "source": "ISO/IEC 25010:2023"}]}), encoding="utf-8")
    (compiled / "security.json").write_text(json.dumps(
        {"version": "2023.11", "sources": ["iso25010", "cisq"], "principles": []}), encoding="utf-8")
    return StandardsService(evaluators, compiled, dims), evaluators


def _custom(evaluators, sid, **extra):
    path = evaluators / f"{sid}.json"
    path.write_text(json.dumps({"id": sid, "name": sid, "principles": [], **extra}), encoding="utf-8")
    ts = datetime(2026, 10, 14, 12, 0).timestamp()
    os.utime(path, (ts, ts))


def _by_id(svc):
    return {m.id: m for m in svc.list_standards()}


def test_custom_dates_come_from_the_file(tmp_path):
    svc, ev = _service(tmp_path)
    _custom(ev, "android", createdAt="2026-10-01", updatedAt="2026-10-15", version="2026.10.15")
    meta = _by_id(svc)["android"]
    assert (meta.created_at, meta.updated_at, meta.version) == ("2026-10-01", "2026-10-15", "2026.10.15")


def test_legacy_custom_dates_fall_back_to_the_files_modified_date(tmp_path):
    svc, ev = _service(tmp_path)
    _custom(ev, "legacy")
    meta = _by_id(svc)["legacy"]
    assert (meta.created_at, meta.updated_at, meta.version) == ("2026-10-14", "2026-10-14", "2026.10.14")
    assert "createdAt" not in json.loads((ev / "legacy.json").read_text())


def test_malformed_dates_are_treated_as_missing(tmp_path):
    svc, ev = _service(tmp_path)
    _custom(ev, "odd", createdAt="garbage-xx-yy", updatedAt=["x"])
    meta = _by_id(svc)["odd"]
    assert meta.created_at == "2026-10-14" and meta.updated_at == "2026-10-14"


def test_builtin_exposes_its_compiled_sources(tmp_path):
    svc, _ = _service(tmp_path)
    meta = _by_id(svc)["security"]
    assert meta.sources == ("iso25010", "cisq")
    assert meta.version == "2023.11"
    assert meta.created_at is None
