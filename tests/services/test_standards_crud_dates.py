"""Created, updated and version are set by saves, and move only on a real change."""
import json
import os
from datetime import datetime

import pytest

from quodeq.services.standards import StandardsService

_PRINCIPLES = [{"id": "P1", "name": "P", "requirements": [{"id": "P1-R1", "text": "t"}]}]


@pytest.fixture()
def svc(tmp_path):
    evaluators = tmp_path / "evaluators"
    dims = tmp_path / "dimensions.json"
    dims.write_text('{"applies": []}', encoding="utf-8")
    clock = {"today": "2026-10-15"}
    service = StandardsService(evaluators, tmp_path / "compiled", dims, today=lambda: clock["today"])
    return service, evaluators, clock


def _file(evaluators, sid):
    return json.loads((evaluators / f"{sid}.json").read_text())


def _dates(data):
    return data["createdAt"], data["updatedAt"], data["version"]


def test_create_stamps_all_three(svc):
    service, ev, _ = svc
    service.create_standard({"id": "a", "name": "A", "principles": _PRINCIPLES})
    assert _dates(_file(ev, "a")) == ("2026-10-15", "2026-10-15", "2026.10.15")


def test_save_without_change_keeps_dates(svc):
    service, ev, clock = svc
    service.create_standard({"id": "a", "name": "A", "principles": _PRINCIPLES})
    clock["today"] = "2026-10-20"
    service.update_standard("a", {"id": "a", "name": "A", "principles": _PRINCIPLES})
    assert _dates(_file(ev, "a")) == ("2026-10-15", "2026-10-15", "2026.10.15")


def test_content_change_bumps_updated_and_version_only(svc):
    service, ev, clock = svc
    service.create_standard({"id": "a", "name": "A", "principles": _PRINCIPLES})
    clock["today"] = "2026-10-20"
    service.update_standard("a", {"id": "a", "name": "A renamed", "principles": _PRINCIPLES})
    assert _dates(_file(ev, "a")) == ("2026-10-15", "2026-10-20", "2026.10.20")


def test_first_edit_of_a_legacy_standard_keeps_its_file_date_as_created(svc):
    service, ev, _ = svc
    ev.mkdir()
    path = ev / "old.json"
    path.write_text(json.dumps({"id": "old", "name": "Old", "principles": _PRINCIPLES}), encoding="utf-8")
    ts = datetime(2026, 9, 1, 12, 0).timestamp()
    os.utime(path, (ts, ts))
    service.update_standard("old", {"id": "old", "name": "Old v2", "principles": _PRINCIPLES})
    assert _dates(_file(ev, "old"))[:2] == ("2026-09-01", "2026-10-15")


def test_duplicate_and_import_start_fresh(svc):
    service, ev, clock = svc
    service.create_standard({"id": "a", "name": "A", "principles": _PRINCIPLES})
    clock["today"] = "2026-10-21"
    service.duplicate_standard("a", "a-copy")
    service.import_from_file({"id": "imp", "name": "Imp", "principles": _PRINCIPLES,
                              "createdAt": "2020-01-01", "version": "1999"})
    assert _dates(_file(ev, "a-copy")) == ("2026-10-21", "2026-10-21", "2026.10.21")
    assert _dates(_file(ev, "imp")) == ("2026-10-21", "2026-10-21", "2026.10.21")
