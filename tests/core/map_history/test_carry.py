from quodeq.core.finding_identity import SuppressionSubject
from quodeq.core.map_history.carry import carry_forward
from quodeq.core.map_history.raw_run import RawFile, RawRun, ViolationRecord, materialise


def _record(dim: str, n: int) -> tuple[str, ViolationRecord]:
    subject = SuppressionSubject(dim, f"R{n}", "", "a.py", n, (None,), "a.py")
    return f"{dim}{n}", ViolationRecord(subject, "major", f"{dim}:v:{n:012x}")


RECORDS = dict(_record(dim, n) for dim in ("sec", "mnt") for n in range(4))


def _run(dims: tuple[str, ...], files: dict[str, tuple[list[str], dict[str, int]]]) -> RawRun:
    """``files``: ``path -> (record keys, {dimension: compliance count})``."""
    out = {}
    for path, (keys, comp) in files.items():
        marks = sorted((f"{dim}:c:{n:012x}", n) for dim, n in comp.items())
        out[path] = RawFile(tuple(sorted(keys)), tuple(n for _, n in marks), tuple(m for m, _ in marks))
    return RawRun(dims, out)


def _totals(run: RawRun) -> dict[str, tuple[int, int]]:
    snap = materialise(run, RECORDS, set())
    return {p: (s.violations, s.compliance) for p, s in snap.files.items()}


def test_a_run_missing_a_dimension_takes_it_from_the_latest_earlier_run_that_has_it():
    first = _run(("mnt", "sec"), {"a.py": (["sec0", "mnt0"], {"mnt": 2}), "b.py": ([], {"mnt": 1})})
    second = _run(("mnt", "sec"), {"a.py": (["sec0", "mnt1"], {"mnt": 3})})
    short = _run(("sec",), {"a.py": (["sec1"], {"sec": 1})})
    got = carry_forward([first, second, short], RECORDS)
    assert got[2].dims == ("mnt", "sec")
    assert got[2].files["a.py"].violations == ("mnt1", "sec1")
    assert _totals(got[2]) == {"a.py": (2, 4)}


def test_a_dimension_reported_again_replaces_what_was_carried_even_when_empty():
    first = _run(("mnt", "sec"), {"a.py": (["sec0", "mnt0"], {})})
    got = carry_forward([first, _run(("sec",), {}), _run(("mnt", "sec"), {})], RECORDS)
    assert _totals(got[1]) == {"a.py": (1, 0)} and got[2].files == {}


def test_runs_that_report_every_dimension_seen_so_far_are_left_as_they_are():
    runs = [_run(("sec",), {"a.py": (["sec0"], {})}), _run(("mnt", "sec"), {"a.py": (["mnt0"], {})})]
    got = carry_forward(runs, RECORDS)
    assert all(a is b for a, b in zip(got, runs, strict=True))
