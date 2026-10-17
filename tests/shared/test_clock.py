"""utc_now_iso and utc_iso_from_epoch: the UTC ISO-8601 stamps stored on jobs, runs and records."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from quodeq.shared.clock import ISO_SECONDS, normalise_utc_iso, utc_iso_from_epoch, utc_now_iso


def test_utc_now_iso_is_an_aware_utc_timestamp_close_to_now():
    before = datetime.now(timezone.utc)
    stamp = datetime.fromisoformat(utc_now_iso())
    after = datetime.now(timezone.utc)
    assert stamp.utcoffset() == timedelta(0)
    assert before <= stamp <= after


def test_utc_now_iso_keeps_the_plus_zero_offset_suffix():
    assert utc_now_iso().endswith("+00:00")


def test_utc_now_iso_at_second_precision_drops_the_fraction():
    before = datetime.now(timezone.utc).replace(microsecond=0)
    text = utc_now_iso(timespec=ISO_SECONDS)
    after = datetime.now(timezone.utc)
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00", text)
    assert before <= datetime.fromisoformat(text) <= after


def test_utc_iso_from_epoch_truncates_to_the_second():
    assert utc_iso_from_epoch(0) == "1970-01-01T00:00:00+00:00"
    assert utc_iso_from_epoch(86_401.999) == "1970-01-02T00:00:01+00:00"


def test_normalised_stamps_order_by_real_time() -> None:
    stamps = ["2026-10-10T01:36:00Z", "2026-10-10T01:36:00.5+00:00", "2026-10-10T03:35:59+02:00"]
    normalised = [normalise_utc_iso(s) for s in stamps]
    assert normalised[0] == "2026-10-10T01:36:00.000000+00:00"
    assert sorted(normalised) == [normalised[2], normalised[0], normalised[1]]


def test_a_naive_stamp_is_utc_and_garbage_is_none() -> None:
    assert normalise_utc_iso("2026-10-10T01:36:00") == "2026-10-10T01:36:00.000000+00:00"
    assert normalise_utc_iso("not a date") is None
    assert normalise_utc_iso("") is None
