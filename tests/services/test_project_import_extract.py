"""safe_extract never writes more bytes than the validated header declares."""
from __future__ import annotations

import io
import struct
import zipfile

import pytest

from quodeq.services.project_import import ImportValidationError, safe_extract

_CD_SIGNATURE = b"PK\x01\x02"
_CD_FILE_SIZE_OFFSET = 24  # uncompressed size field in a central directory entry


def _zip_with_lying_size(declared: int, payload: bytes) -> zipfile.ZipFile:
    """A zip whose central directory claims *declared* bytes for a larger member."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("u/big.txt", payload)
    raw = bytearray(buf.getvalue())
    struct.pack_into("<I", raw, raw.rfind(_CD_SIGNATURE) + _CD_FILE_SIZE_OFFSET, declared)
    return zipfile.ZipFile(io.BytesIO(bytes(raw)))


def test_lying_file_size_header_cannot_inflate_extraction(tmp_path):
    """The validators trust ZipInfo.file_size; the stdlib reader stops at that
    size and fails the CRC, so a small declared size cannot write a large file."""
    declared = 10
    zf = _zip_with_lying_size(declared, b"A" * (4 * 1024 * 1024))
    info = zf.infolist()[0]
    assert info.file_size == declared

    with pytest.raises(zipfile.BadZipFile):
        safe_extract(zf, {"u/big.txt": info}, tmp_path)

    assert (tmp_path / "u" / "big.txt").stat().st_size <= declared


class _OverlongMember:
    """A ``zf.open`` stand-in whose stream is longer than the header declared."""

    def __init__(self, payload: bytes) -> None:
        self._stream = io.BytesIO(payload)

    def __enter__(self):
        return self._stream

    def __exit__(self, *_exc):
        return False


def _honest_zip(payload: bytes) -> zipfile.ZipFile:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("u/a.txt", payload)
    return zipfile.ZipFile(io.BytesIO(buf.getvalue()))


def test_bytes_past_the_declared_size_are_refused_before_reaching_disk(tmp_path, monkeypatch):
    """Independent of the stdlib reader: a stream that keeps going past
    ``file_size`` is cut at the first byte over, not copied to the end."""
    zf = _honest_zip(b"A" * 100)
    info = zf.infolist()[0]
    monkeypatch.setattr(zf, "open", lambda _info: _OverlongMember(b"A" * 100 + b"B" * (512 * 1024)))

    with pytest.raises(ImportValidationError) as excinfo:
        safe_extract(zf, {"u/a.txt": info}, tmp_path)

    assert excinfo.value.code == "TOO_LARGE"
    assert (tmp_path / "u" / "a.txt").stat().st_size <= 100


def test_archive_budget_caps_the_extraction_total(tmp_path):
    zf = _honest_zip(b"A" * 1000)
    info = zf.infolist()[0]

    with pytest.raises(ImportValidationError) as excinfo:
        safe_extract(zf, {"u/a.txt": info}, tmp_path, max_total_bytes=999)
    assert excinfo.value.code == "TOO_LARGE"

    safe_extract(zf, {"u/a.txt": info}, tmp_path, max_total_bytes=1000)
    assert (tmp_path / "u" / "a.txt").read_bytes() == b"A" * 1000
