"""Service for managing standards (built-in and custom evaluators)."""
from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

from quodeq.core.types.standard import StandardDetail, StandardMeta
from quodeq.services._standards_crud import (
    IMPORT_STATUS_CONFLICT,
    create, delete, duplicate, import_from_file, today_iso, update,
)
from quodeq.services._standards_io import default_read_json, default_write_json
from quodeq.services._standards_queries import (
    annotate_sync, check_builtin_id, get_standard, list_builtin, list_custom_with_payloads, load_cwe_list,
)
from quodeq.services.shared_settings import read_settings
from quodeq.services.wiring import (
    compiled_exists as _compiled_exists,
    ensure_evaluators_dir as _ensure_evaluators_dir,
    remove_standard as _remove_standard,
    standard_exists as _standard_exists,
    standard_modified_date as _standard_modified_date,
    standard_path as _standard_path,
)
from quodeq.services.wiring_sync import read_shared_standards, shared_standards_dir

__all__ = ["StandardsService", "IMPORT_STATUS_CONFLICT", "shared_standards_provider"]


def shared_standards_provider(env: Mapping[str, str] | None = None) -> Callable[[], Mapping[str, dict] | None]:
    """A reader of the connected shared repository's standards; None while none is connected."""
    def read() -> Mapping[str, dict] | None:
        url = read_settings(env).url
        return read_shared_standards(shared_standards_dir(url, env)) if url else None
    return read


@dataclass
class _FsStandardsStore:
    """Default ``StandardsStore``: data.fs file mechanics plus the
    service's injected JSON read/write callables."""

    read: Callable[[Path], dict]
    write: Callable[[Path, dict], None]

    path = staticmethod(_standard_path)
    exists = staticmethod(_standard_exists)
    compiled_exists = staticmethod(_compiled_exists)
    ensure_dir = staticmethod(_ensure_evaluators_dir)
    remove = staticmethod(_remove_standard)
    modified_date = staticmethod(_standard_modified_date)


class StandardsService:
    """Facade for CRUD operations on built-in and custom evaluation standards."""

    def __init__(self, evaluators_dir: Path, compiled_dir: Path, dimensions_file: Path,
                 read_json: Callable[[Path], dict] | None = None,
                 today: Callable[[], str] | None = None,
                 shared_standards: Callable[[], Mapping[str, dict] | None] | None = None) -> None:
        self._evaluators_dir = evaluators_dir
        self._compiled_dir = compiled_dir
        self._dimensions_file = dimensions_file
        self._read_json = read_json or default_read_json
        self._store = _FsStandardsStore(read=self._read_json, write=default_write_json)
        self._today = today or today_iso
        self._shared_standards = shared_standards

    def list_standards(self) -> list[StandardMeta]:
        """Return metadata for all available standards (built-in + custom)."""
        builtin = list_builtin(self._dimensions_file, self._compiled_dir, self._read_json)
        customs = list_custom_with_payloads(self._evaluators_dir, self._read_json, self._store.modified_date)
        remote = self._shared_standards() if self._shared_standards else None
        if remote is None:
            return builtin + [meta for meta, _ in customs]
        return builtin + annotate_sync(customs, remote, frozenset(m.id for m in builtin))

    def get_standard(self, standard_id: str) -> StandardDetail:
        """Retrieve the full detail of a single standard by ID."""
        return get_standard(standard_id, self._evaluators_dir, self._compiled_dir,
                            self._dimensions_file, self._read_json)

    def create_standard(self, data: dict) -> StandardDetail:
        """Persist a new custom standard from the given data dict."""
        return create(data, self._evaluators_dir, self._store, today=self._today)

    def update_standard(self, standard_id: str, data: dict) -> StandardDetail:
        """Update an existing custom standard with new data."""
        return update(standard_id, data, self._evaluators_dir, self._store, today=self._today)

    def delete_standard(self, standard_id: str) -> None:
        """Remove a custom standard; raises if *standard_id* is built-in."""
        delete(standard_id, self._evaluators_dir, self._compiled_dir,
               self._store,
               lambda sid: check_builtin_id(sid, self._dimensions_file, self._read_json))

    def duplicate_standard(self, standard_id: str, new_id: str) -> StandardDetail:
        """Clone an existing standard under a new ID."""
        return duplicate(new_id=new_id,
                         source_detail=self.get_standard(standard_id),
                         evaluators_dir=self._evaluators_dir,
                         store=self._store, today=self._today)

    def import_from_file(self, data: dict, force: bool = False) -> dict:
        """Import a standard from a parsed JSON file payload."""
        return import_from_file(data, force, self._evaluators_dir, self._store, today=self._today)

    def load_cwe_list(self) -> list[dict]:
        """Load the full CWE weakness catalogue from compiled data."""
        return load_cwe_list(self._compiled_dir, self._read_json)
