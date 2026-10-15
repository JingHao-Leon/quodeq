"""In-app help tool: the Help pages the user can open, so questions about
what a number, badge or control on screen means are answered from the same
text the UI documents instead of from memory."""
from __future__ import annotations

import re
from pathlib import Path

from quodeq.assistant.tools._constants import JSON_SCHEMA_TYPE_OBJECT, JSON_SCHEMA_TYPE_STRING
from quodeq.assistant.tools.registry import ToolError, ToolRegistry, ToolSpec

# Shipped in the wheel with the UI sources (only the screenshots are excluded).
HELP_DIR = Path(__file__).resolve().parents[2] / "ui" / "src" / "features" / "help" / "content" / "en"
_MD = ".md"
_HEADING = re.compile(r"^(#{2,4})\s+(.*)$")
_WORD = re.compile(r"[a-z0-9]+")
_MAX_SECTIONS = 6


def _topics(help_dir: Path) -> dict[str, Path]:
    try:
        return {p.stem: p for p in sorted(help_dir.glob(f"*{_MD}"))}
    except OSError as exc:
        raise ToolError(f"could not list the help pages: {exc}") from exc


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ToolError(f"could not read help page {path.stem}: {exc}") from exc


def _title(text: str, fallback: str) -> str:
    for line in text.splitlines():
        match = _HEADING.match(line)
        if match:
            return match.group(2).strip()
    return fallback


def _sections(topic: str, text: str) -> list[dict]:
    """The page split at its headings, each section with the heading path above it."""
    sections: list[dict] = []
    trail: list[str] = []
    body: list[str] = []

    def flush() -> None:
        content = "\n".join(body).strip()
        if content:
            sections.append({"topic": topic, "section": " > ".join(trail), "text": content})
        body.clear()

    for line in text.splitlines():
        match = _HEADING.match(line)
        if not match:
            body.append(line)
            continue
        flush()
        depth = len(match.group(1)) - 2
        trail[:] = [*trail[:depth], match.group(2).strip()]
    flush()
    return sections


_DEFINITION_WEIGHT = 4


def _score(section: dict, words: list[str]) -> int:
    """Words present, the whole phrase more, and a bolded term (the pages'
    way of defining one) most."""
    haystack = f"{section['section']} {section['text']}".lower()
    phrase = " ".join(words)
    defined = haystack.count(f"**{phrase}**") * len(words) * _DEFINITION_WEIGHT
    return defined + haystack.count(phrase) * len(words) + sum(1 for w in words if w in haystack)


def get_help(topic: str | None = None, query: str | None = None, help_dir: Path = HELP_DIR) -> dict:
    """No argument: the help pages. `topic`: one page in full. `query`: the
    sections across all pages that best match the words."""
    pages = _topics(help_dir)
    if topic:
        path = pages.get(topic.strip().lower().removesuffix(_MD))
        if path is None:
            raise ToolError(f"no help page {topic!r}; pages: {', '.join(pages)}")
        return {"topic": path.stem, "text": _read(path)}
    if query:
        words = _WORD.findall(query.lower())
        if not words:
            raise ToolError("query has no words to search for")
        ranked = [(s, _score(s, words)) for stem, p in pages.items() for s in _sections(stem, _read(p))]
        hits = sorted((r for r in ranked if r[1]), key=lambda r: -r[1])[:_MAX_SECTIONS]
        return {"query": query, "sections": [s for s, _ in hits]}
    return {"pages": [{"topic": stem, "title": _title(_read(p), stem)} for stem, p in pages.items()]}


def register_help_tools(registry: ToolRegistry) -> None:
    """Register get_help; it reads the shipped Help pages, so it needs no project context."""
    registry.register(ToolSpec(
        "get_help",
        "Quodeq's in-app Help pages: what every screen, number, badge, chart "
        "and control means and how it is computed (pass rate, per 100 files, "
        "grades and the grade formula, Risk zones, fix plans, Compare, and so "
        "on). No argument lists the pages; `topic` returns one page in full; "
        "`query` returns the best matching sections across all pages. Use it "
        "before explaining anything the user sees on screen.",
        {"type": JSON_SCHEMA_TYPE_OBJECT, "properties": {
            "topic": {"type": JSON_SCHEMA_TYPE_STRING},
            "query": {"type": JSON_SCHEMA_TYPE_STRING},
        }},
        lambda **kw: get_help(**kw)))
