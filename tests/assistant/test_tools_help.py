"""get_help: the in-app Help pages as the assistant's source for what the UI means."""
import pytest

from quodeq.assistant.tools.help_tools import HELP_DIR, get_help
from quodeq.assistant.tools.registry import ToolError


@pytest.fixture
def help_dir(tmp_path):
    (tmp_path / "overview.md").write_text(
        "## Overview\n\nThe landing page.\n\n### The header\n\n"
        "- **Pass rate** compliant checks over all checks.\n", encoding="utf-8")
    (tmp_path / "map.md").write_text("## Map\n\nRisk zones by weighted findings per file.\n", encoding="utf-8")
    return tmp_path


def test_no_argument_lists_the_pages_with_their_titles(help_dir):
    assert get_help(help_dir=help_dir) == {"pages": [
        {"topic": "map", "title": "Map"}, {"topic": "overview", "title": "Overview"}]}


def test_topic_returns_the_whole_page(help_dir):
    out = get_help(topic="Overview.md", help_dir=help_dir)
    assert out["topic"] == "overview"
    assert "**Pass rate**" in out["text"]


def test_unknown_topic_names_the_pages(help_dir):
    with pytest.raises(ToolError, match="map, overview"):
        get_help(topic="nope", help_dir=help_dir)


def test_query_returns_the_section_that_defines_the_term(help_dir):
    sections = get_help(query="what is the pass rate?", help_dir=help_dir)["sections"]
    assert sections[0]["topic"] == "overview"
    assert sections[0]["section"] == "Overview > The header"
    assert "compliant checks over all checks" in sections[0]["text"]


def test_query_without_matches_is_empty(help_dir):
    assert get_help(query="kubernetes", help_dir=help_dir)["sections"] == []


def test_the_shipped_help_defines_the_overview_numbers():
    # The tool reads the UI's own Help sources; this breaks if they move.
    topics = {p["topic"] for p in get_help()["pages"]}
    assert {"overview", "grade-formula", "why-this-grade"} <= topics
    texts = " ".join(s["text"] for s in get_help(query="pass rate", help_dir=HELP_DIR)["sections"])
    assert "compliant checks over all checks" in texts
