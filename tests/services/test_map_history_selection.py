from dataclasses import replace

import pytest

from quodeq.core.map_history.selection import FindingSelection, SelectionError
from quodeq.services import map_history
from quodeq.services.map_history import build_map_history
from tests.services._map_history_fixtures import (  # noqa: F401 -- env/cached_runs are pytest fixtures
    cached_runs, env, judged, violation, write_run,
)

ALPHA = [f"feature-alpha/src/a{i}.kt" for i in range(3)]
BETA = [f"feature-beta/src/b{i}.kt" for i in range(3)]
DAYS = ("2026-09-01", "2026-09-08", "2026-09-15")
SECURITY = FindingSelection(frozenset({"security"}))


def _flagged(file: str, principle: str = "Auth", sev: str = "major") -> dict:
    return {**violation(file, sev, req=principle, snip=f"{principle}()"), "principle": principle}


def _write_alpha_fixed_in_security(env) -> None:
    """Alpha has security violations on the first day only and maintainability ones every day; beta is clean."""
    for k, day in enumerate(DAYS):
        security = [_flagged(f) for f in ALPHA] if k == 0 else []
        write_run(env / "proj", f"r{k}", day, {"security": security, "maintainability": [_flagged(f, "Size") for f in ALPHA]},
                  compliance={"security": [judged(f) for f in ALPHA + BETA], "maintainability": [judged(f) for f in BETA]})


def _areas(history, k: int = -1) -> dict:
    return {m.area: m for m in history.frames[k].areas}


def test_no_selection_carries_no_lift(env):
    _write_alpha_fixed_in_security(env)
    assert {m.lift for m in _areas(build_map_history(env, "proj")).values()} == {None}


def test_every_dimension_selected_measures_as_no_selection(env):
    _write_alpha_fixed_in_security(env)
    plain = build_map_history(env, "proj", frames="all")
    every = build_map_history(env, "proj", frames="all",
                              selection=FindingSelection(frozenset({"security", "maintainability"})))
    unlifted = [tuple(replace(m, lift=None) for m in f.areas) for f in every.frames]
    assert unlifted == [f.areas for f in plain.frames] and every.file_names == plain.file_names


def test_one_dimension_measures_its_findings_only(env):
    _write_alpha_fixed_in_security(env)
    first = _areas(build_map_history(env, "proj", frames="all", selection=SECURITY), 0)
    assert (first["alpha"].violations, first["alpha"].density, first["beta"].density) == (3, 2.0, 0.0)


def test_several_dimensions_add_up(env):
    _write_alpha_fixed_in_security(env)
    both = _areas(build_map_history(env, "proj", frames="all",
                                    selection=FindingSelection(frozenset({"security", "maintainability"}))), 0)
    assert (both["alpha"].violations, both["alpha"].density) == (6, 4.0)


def test_lift_is_against_the_selection_across_the_project(env):
    _write_alpha_fixed_in_security(env)
    first = _areas(build_map_history(env, "proj", frames="all", selection=SECURITY), 0)
    assert (first["alpha"].lift, first["beta"].lift) == (2.0, 0.0)


def test_kinds_are_smoothed_over_the_selection(env):
    _write_alpha_fixed_in_security(env)
    history = build_map_history(env, "proj", frames="all", selection=SECURITY)
    alpha = [_areas(history, k)["alpha"] for k in range(len(DAYS))]
    assert [m.raw_kind for m in alpha] == ["watch", "healthy", "healthy"]
    assert [m.kind for m in alpha] == ["watch", "watch", "healthy"]


def test_another_selection_keeps_its_own_kinds(env):
    _write_alpha_fixed_in_security(env)
    history = build_map_history(env, "proj", frames="all", selection=FindingSelection(frozenset({"maintainability"})))
    assert [_areas(history, k)["alpha"].kind for k in range(len(DAYS))] == ["watch"] * len(DAYS)


def test_a_principle_measures_its_violations_over_the_files_its_dimension_checked(env):
    write_run(env / "proj", "r1", DAYS[0], {"security": [_flagged(ALPHA[0], "Crypto", "critical"), _flagged(ALPHA[1])]},
              compliance={"security": [judged(ALPHA[2])]})
    area = _areas(build_map_history(env, "proj", selection=FindingSelection(frozenset({"security"}), "Crypto")))["alpha"]
    assert (area.prod_files, area.violations, area.density, area.compliance_rate) == (3, 1, 2.5, 0.0)


def test_an_unknown_dimension_is_refused(env):
    _write_alpha_fixed_in_security(env)
    with pytest.raises(SelectionError, match="ux"):
        build_map_history(env, "proj", selection=FindingSelection(frozenset({"ux"})))


def test_a_selection_reads_the_stored_days(env, monkeypatch):
    _write_alpha_fixed_in_security(env)
    build_map_history(env, "proj")
    calls = []
    real = map_history.build_raw_run
    monkeypatch.setattr(map_history, "build_raw_run", lambda *a, **kw: calls.append(1) or real(*a, **kw))
    build_map_history(env, "proj", selection=SECURITY)
    assert calls == []


def test_a_selection_stores_nothing_of_its_own(env, cached_runs):
    _write_alpha_fixed_in_security(env)
    plain = build_map_history(env, "proj")
    stored = set(cached_runs)
    build_map_history(env, "proj", selection=SECURITY)
    assert cached_runs == stored and build_map_history(env, "proj") == plain
