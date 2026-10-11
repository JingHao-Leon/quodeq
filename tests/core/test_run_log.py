from quodeq.core.run.run_log import LogRun, choose_baselines, summarise_diff, summarise_progress


def _r(i: int, model: str, dims=("security",)) -> LogRun:
    return LogRun(run_id=f"r{i}", started_at=f"2026-10-{10 + i:02d}T00:00:00Z", model=model, dims=dims)


def test_same_dimensions_same_model_wins_over_a_newer_other_model() -> None:
    runs = [_r(3, "qwen"), _r(2, "gpt"), _r(1, "qwen")]
    assert choose_baselines(runs)["r3"] == ("r1", "same-model")


def test_falls_back_to_other_model_when_no_same_model_run_exists() -> None:
    runs = [_r(3, "qwen"), _r(2, "gpt")]
    assert choose_baselines(runs)["r3"] == ("r2", "other-model")


def test_different_dimensions_never_compare() -> None:
    runs = [_r(3, "qwen"), _r(2, "qwen", dims=("security", "reliability"))]
    assert choose_baselines(runs)["r3"] is None


def test_equal_start_times_are_ordered_by_run_id() -> None:
    a = LogRun("ra", "2026-10-10T00:00:00Z", "qwen", ("security",))
    b = LogRun("rb", "2026-10-10T00:00:00Z", "qwen", ("security",))
    for order in ([a, b], [b, a]):
        result = choose_baselines(order)
        assert result["rb"] == ("ra", "same-model")
        assert result["ra"] is None


def test_unknown_model_is_not_the_same_model() -> None:
    older = LogRun("r1", "2026-10-11T00:00:00Z", None, ("security",))
    newer = LogRun("r2", "2026-10-12T00:00:00Z", None, ("security",))
    assert choose_baselines([newer, older])["r2"] == ("r1", "other-model")


def test_diff_summary_counts_and_severities() -> None:
    payload = {"dimensions": {"security": {
        "counts": {"new": 2, "resolved": 1, "notReevaluated": 4},
        "new": [{"severity": "major"}, {"severity": "minor"}], "resolved": [{"severity": "minor"}]}}}
    s = summarise_diff(payload)
    assert s["counts"] == {"new": 2, "resolved": 1, "notReevaluated": 4}
    assert s["newSev"] == {"major": 1, "minor": 1} and s["resolvedSev"] == {"minor": 1}


def test_progress_summary_adds_files_and_seconds() -> None:
    progress = {"dimensions": [{"files": {"taken": 422}, "elapsedS": 5548.0}, {"files": {"taken": 83}, "elapsedS": 1357.0}]}
    assert summarise_progress(progress) == {"filesAnalysed": 505, "activeSeconds": 6905}


def test_diff_summary_prefers_full_severity_tallies_over_capped_lists() -> None:
    payload = {"dimensions": {"security": {
        "counts": {"new": 3, "resolved": 0, "notReevaluated": 0,
                   "newSev": {"major": 2, "minor": 1}, "resolvedSev": {}},
        "new": [{"severity": "major"}], "resolved": []}}}
    s = summarise_diff(payload)
    assert s["newSev"] == {"major": 2, "minor": 1} and s["resolvedSev"] == {}
