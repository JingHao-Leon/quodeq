"""Credentials stay out of error messages and reprs."""
from __future__ import annotations

import pytest

from quodeq.data.fs.repo_validation import validate_remote_url
from quodeq.services.base import EvaluationOptions
from quodeq.services.shared_connect import ConnectOutcome, ConnectStatus
from quodeq.services.shared_connect_job import connect_failure
from quodeq.services.shared_publish import PublishError, prepare_clone

_SECRET = "s3cr3t-token"
_URL = f"https://user:{_SECRET}@example.com/org/repo.git"


def test_connect_clone_failure_masks_credentials():
    failure = connect_failure(ConnectOutcome(status=ConnectStatus.CLONE_FAILED, url=_URL))
    assert _SECRET not in failure.message
    assert "https://***@example.com/org/repo.git" in failure.message


def test_publish_unreachable_clone_masks_credentials(monkeypatch):
    monkeypatch.setattr("quodeq.services._publish_git.ensure_shared_clone", lambda url, env: None)
    with pytest.raises(PublishError) as excinfo:
        prepare_clone(_URL, None)
    assert _SECRET not in str(excinfo.value)
    assert "https://***@example.com/org/repo.git" in str(excinfo.value)


def test_invalid_url_format_masks_credentials():
    with pytest.raises(ValueError, match="Invalid repository URL format") as excinfo:
        validate_remote_url(f"https://user:{_SECRET}@exa mple.com/org/repo.git")
    assert _SECRET not in str(excinfo.value)


def test_evaluation_options_repr_hides_api_key():
    options = EvaluationOptions(provider_api_key=_SECRET)
    assert _SECRET not in repr(options)
    assert options.provider_api_key == _SECRET
