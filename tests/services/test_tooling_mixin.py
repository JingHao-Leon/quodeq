"""Tests for tooling_mixin.py — AI client discovery and model fetching."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch


from quodeq.services.tooling_mixin import (
    FsToolingMixin,
    get_allowed_client_ids,
    _DEFAULT_CLIENT_IDS,
)
from quodeq.services.wiring import CatalogUnavailable


# ---------------------------------------------------------------------------
# get_allowed_client_ids
# ---------------------------------------------------------------------------


class TestGetAllowedClientIds:
    @patch("quodeq.services.tooling_mixin.get_provider_configs", return_value={})
    def test_default_ids(self, mock_cfg):
        ids = get_allowed_client_ids(env={})
        assert ids == _DEFAULT_CLIENT_IDS

    def test_env_override(self):
        ids = get_allowed_client_ids(env={"QUODEQ_AI_CLIENTS": "foo,bar"})
        assert ids == frozenset({"foo", "bar"})

    @patch("quodeq.services.tooling_mixin.get_provider_configs")
    def test_includes_api_providers(self, mock_cfg):
        mock_cfg.return_value = {
            "ollama": {"type": "api"},
            "claude": {"type": "cli"},
        }
        ids = get_allowed_client_ids(env={})
        assert "ollama" in ids
        assert "claude" in ids  # from defaults


# ---------------------------------------------------------------------------
# get_ai_clients
# ---------------------------------------------------------------------------


class TestGetAiClients:
    @patch("quodeq.services.tooling_mixin.get_provider_configs", return_value={})
    @patch("shutil.which", return_value="/usr/bin/claude")
    def test_installed_cli_marked_installed(self, mock_which, mock_cfg):
        mixin = FsToolingMixin()
        result = mixin.get_ai_clients(env={})
        claude = next(c for c in result["clients"] if c["id"] == "claude")
        assert claude["installed"] is True

    @patch("quodeq.services.tooling_mixin.get_provider_configs", return_value={})
    @patch("shutil.which", return_value=None)
    def test_uninstalled_cli_still_listed_with_flag(self, mock_which, mock_cfg):
        mixin = FsToolingMixin()
        result = mixin.get_ai_clients(env={})
        # All default CLI candidates are returned so the UI can render them disabled.
        ids = [c["id"] for c in result["clients"]]
        assert {"claude", "codex", "gemini"} <= set(ids)
        assert all(c["installed"] is False for c in result["clients"])

    def test_env_override_candidates(self):
        mixin = FsToolingMixin()
        with patch("quodeq.services.tooling_mixin.get_provider_configs", return_value={}):
            with patch("shutil.which", return_value="/usr/bin/custom"):
                result = mixin.get_ai_clients(env={"QUODEQ_AI_CLIENTS": "custom"})
        ids = [c["id"] for c in result["clients"]]
        assert "custom" in ids

    @patch("quodeq.services.tooling_mixin.get_provider_configs")
    @patch("shutil.which", return_value=None)
    def test_custom_provider_excluded(self, mock_which, mock_cfg):
        """The 'custom' provider ID should not appear in clients."""
        mock_cfg.return_value = {"custom": {"type": "api"}, "ollama": {"type": "api"}}
        mixin = FsToolingMixin()
        result = mixin.get_ai_clients(env={})
        ids = [c["id"] for c in result["clients"]]
        assert "custom" not in ids
        assert "ollama" in ids


# ---------------------------------------------------------------------------
# _get_cli_models
# ---------------------------------------------------------------------------


class TestGetCliModels:
    @patch("quodeq.services.tooling_mixin.get_allowed_client_ids", return_value=frozenset({"claude"}))
    @patch("shutil.which", return_value="/usr/bin/claude")
    @patch("subprocess.run")
    def test_returns_models(self, mock_run, mock_which, mock_ids):
        mock_run.return_value = MagicMock(returncode=0, stdout="model-a\nmodel-b\n")
        mixin = FsToolingMixin()
        result = mixin._get_cli_models("claude")
        assert result == {"models": ["model-a", "model-b"]}

    @patch("quodeq.services.tooling_mixin.get_allowed_client_ids", return_value=frozenset({"claude"}))
    @patch("shutil.which", return_value="/usr/bin/claude")
    @patch("subprocess.run")
    def test_filters_comment_lines(self, mock_run, mock_which, mock_ids):
        mock_run.return_value = MagicMock(returncode=0, stdout="# Models\nmodel-a\n=====\nmodel-b\n")
        mixin = FsToolingMixin()
        result = mixin._get_cli_models("claude")
        assert result == {"models": ["model-a", "model-b"]}

    @patch("quodeq.services.tooling_mixin.get_allowed_client_ids", return_value=frozenset())
    def test_disallowed_client(self, mock_ids):
        mixin = FsToolingMixin()
        assert mixin._get_cli_models("evil") == {"models": []}

    def test_non_alnum_client(self):
        mixin = FsToolingMixin()
        with patch("quodeq.services.tooling_mixin.get_allowed_client_ids", return_value=frozenset({"a;b"})):
            assert mixin._get_cli_models("a;b") == {"models": []}

    @patch("quodeq.services.tooling_mixin.get_allowed_client_ids", return_value=frozenset({"claude"}))
    @patch("shutil.which", return_value=None)
    def test_not_installed(self, mock_which, mock_ids):
        mixin = FsToolingMixin()
        assert mixin._get_cli_models("claude") == {"models": []}

    @patch("quodeq.services.tooling_mixin.get_allowed_client_ids", return_value=frozenset({"claude"}))
    @patch("shutil.which", return_value="/usr/bin/claude")
    @patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="claude", timeout=8))
    def test_timeout(self, mock_run, mock_which, mock_ids):
        mixin = FsToolingMixin()
        assert mixin._get_cli_models("claude") == {"models": []}

    @patch("quodeq.services.tooling_mixin.get_allowed_client_ids", return_value=frozenset({"claude"}))
    @patch("shutil.which", return_value="/usr/bin/claude")
    @patch("subprocess.run")
    def test_nonzero_returncode(self, mock_run, mock_which, mock_ids):
        mock_run.return_value = MagicMock(returncode=1, stdout="error output")
        mixin = FsToolingMixin()
        assert mixin._get_cli_models("claude") == {"models": []}


# ---------------------------------------------------------------------------
# get_client_models (uses fetcher registry)
# ---------------------------------------------------------------------------


class TestGetClientModels:
    def test_uses_registered_fetcher(self):
        mixin = FsToolingMixin()
        custom_fetcher = MagicMock(return_value={"models": ["custom-model"]})
        mixin._model_fetchers["myapi"] = custom_fetcher
        result = mixin.get_client_models("myapi")
        assert result == {"models": ["custom-model"]}
        custom_fetcher.assert_called_once_with("myapi")

    def test_configure_model_fetchers_routes_claude_and_codex_to_the_live_catalog(self):
        mixin = FsToolingMixin()
        assert "claude" not in mixin._model_fetchers
        mixin.configure_model_fetchers()
        assert mixin._model_fetchers["claude"] == mixin._get_catalog_models
        assert mixin._model_fetchers["codex"] == mixin._get_catalog_models
        assert "gemini" not in mixin._model_fetchers

    @patch("quodeq.services.tooling_mixin.get_allowed_client_ids", return_value=frozenset({"claude"}))
    @patch("shutil.which", return_value="/usr/bin/claude")
    @patch("subprocess.run")
    def test_falls_back_to_cli(self, mock_run, mock_which, mock_ids):
        mock_run.return_value = MagicMock(returncode=0, stdout="model-x\n")
        mixin = FsToolingMixin()
        result = mixin.get_client_models("claude")
        assert result == {"models": ["model-x"]}


# ---------------------------------------------------------------------------
# _get_catalog_models (live CLI catalog, cached)
# ---------------------------------------------------------------------------

_CATALOG = [{"id": "opus", "label": "Opus", "description": "", "efforts": ["high"],
             "defaultEffort": None, "isDefault": True, "pinned": False}]
_FETCH = "quodeq.services.tooling_mixin.fetch_cli_model_catalog"


def _catalog_mixin() -> FsToolingMixin:
    mixin = FsToolingMixin()
    mixin.configure_model_fetchers()
    return mixin


class TestCatalogModels:
    @patch(_FETCH, return_value=_CATALOG)
    def test_returns_ids_and_catalog(self, mock_fetch):
        assert _catalog_mixin().get_client_models("claude") == {"models": ["opus"], "catalog": _CATALOG}

    @patch(_FETCH, return_value=_CATALOG)
    def test_second_call_is_served_from_cache(self, mock_fetch):
        mixin = _catalog_mixin()
        mixin.get_client_models("claude")
        mixin.get_client_models("claude")
        assert mock_fetch.call_count == 1

    @patch(_FETCH, return_value=_CATALOG)
    def test_refresh_asks_the_cli_again(self, mock_fetch):
        mixin = _catalog_mixin()
        mixin.get_client_models("claude")
        mixin.get_client_models("claude", refresh=True)
        assert mock_fetch.call_count == 2

    @patch(_FETCH, side_effect=CatalogUnavailable("timed out"))
    def test_failure_reports_an_error_and_is_not_cached(self, mock_fetch):
        mixin = _catalog_mixin()
        result = mixin.get_client_models("codex")
        mixin.get_client_models("codex")
        assert result["models"] == []
        assert result["error_code"] == "CLIENT_MODELS_UNAVAILABLE"
        assert mock_fetch.call_count == 2

    @patch(_FETCH, return_value=_CATALOG)
    def test_cli_env_drops_what_the_provider_config_removes(self, mock_fetch):
        _catalog_mixin()._get_catalog_models("claude", env={"CLAUDECODE": "1", "PATH": "/bin"})
        assert mock_fetch.call_args.kwargs["env"] == {"PATH": "/bin"}
