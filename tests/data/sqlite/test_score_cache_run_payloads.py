import pytest

from quodeq.data.sqlite.score_cache_run_payloads import MAP_SNAPSHOT, RUN_CHANGE, RunPayloadTable


def test_only_allow_listed_tables_can_be_named():
    with pytest.raises(ValueError):
        RunPayloadTable("findings; DROP TABLE run_change")


def test_each_table_keeps_its_serialisation():
    assert (RUN_CHANGE.table, RUN_CHANGE.separators) == ("run_change", None)
    assert (MAP_SNAPSHOT.table, MAP_SNAPSHOT.separators) == ("map_snapshot", (",", ":"))
