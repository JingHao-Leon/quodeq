from unittest.mock import patch

from quodeq.update import checker
from quodeq.update.state import UpdateState, write_state


def _env(tmp_path):
    return {"QUODEQ_UPDATE_STATE_PATH": str(tmp_path / "update_state.json")}


def test_begin_in_place_upgrade_needs_an_update(tmp_path) -> None:
    result = checker.begin_in_place_upgrade(_env(tmp_path))
    assert result["code"] == "NO_UPDATE"


def test_begin_in_place_upgrade_unsupported(tmp_path) -> None:
    env = _env(tmp_path)
    write_state(UpdateState(latest_version="9.9.9"), env)
    with patch("quodeq.update.checker.__version__", "1.4.0"), \
         patch("quodeq.update.inplace.unsupported_reason", return_value="editable"):
        result = checker.begin_in_place_upgrade(env)
    assert result["code"] == "UNSUPPORTED"
    assert result["reason"] == "editable"


def test_begin_in_place_upgrade_starts(tmp_path) -> None:
    env = _env(tmp_path)
    write_state(UpdateState(latest_version="9.9.9"), env)
    with patch("quodeq.update.checker.__version__", "1.4.0"), \
         patch("quodeq.update.inplace.unsupported_reason", return_value=None), \
         patch("quodeq.update.inplace.start", return_value=True) as start:
        result = checker.begin_in_place_upgrade(env)
    assert result["ok"] is True
    start.assert_called_once_with("9.9.9", env)
