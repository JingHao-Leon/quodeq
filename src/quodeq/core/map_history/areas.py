"""Functional areas from file paths alone (no model): build modules with layer
prefixes, Features/Modules folders, the JVM package after the reverse-domain
root, name-stem matches and, last, the first meaningful folder."""
from __future__ import annotations

import os
import re
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, replace

# Layer prefixes on build modules: feature-article and domain-data-article are one area.
LAYER_PREFIXES = ("feature-component-", "feature-", "domain-data-", "domain-", "data-",
                  "foundation-", "common-", "core-", "lib-")
# Folders whose child names a feature area.
FEATURE_DIRS = frozenset({"features", "feature", "modules", "packages", "apps", "libs",
                          "components", "screens", "scenes"})
# Folders that never name an area on their own.
SKIP_SEGMENTS = frozenset({"src", "main", "kotlin", "java", "swift", "sources", "lib", "app",
                           "test", "tests", "androidtest"})
# Segments after kotlin/ or java/ that form the reverse-domain package root (nl/x/edition).
JVM_PACKAGE_DEPTH = 3
# A name must be at least this long to be matched as a stem (avoids "ui" matching everything).
MIN_STEM = 3
LAYER_SHARED = "shared"
LAYER_PACKAGE = "package"
LAYER_STEM = "stem"          # a shared or package file whose name starts with a named area
JVM_SOURCE_DIRS = ("java", "kotlin")
# The area of a file with no meaningful folder.
ROOT_AREA = "(root)"
# Folder depth at which the second meaningful folder names the area (src-like roots come first).
NESTED_FOLDERS = 2
_TEST_SEGMENT = re.compile(r"(^|/)(\w*tests?|androidtest|uitests|spec|__tests__)(/|$)", re.I)


@dataclass(frozen=True)
class AreaAssignment:
    """Where one file sits on the map."""

    area: str
    layer: str      # module prefix without '-', a feature dir name, "package", "stem" or "shared"
    is_test: bool


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _merge_key(name: str) -> str:
    key = _norm(name)
    return key[:-1] if key.endswith("s") and len(key) > MIN_STEM else key


def _raw_area(segs: list[str]) -> tuple[str, str]:
    """``(area, layer)`` the path segments *segs* give before names are matched across paths."""
    for prefix in LAYER_PREFIXES:
        if segs[0].startswith(prefix):
            return segs[0][len(prefix):], prefix.rstrip("-")
    for i, seg in enumerate(segs[:-1]):
        if seg.lower() in FEATURE_DIRS and i + 1 < len(segs) - 1:
            return segs[i + 1], seg.lower()
    for i, seg in enumerate(segs[:-1]):
        if seg in JVM_SOURCE_DIRS and i + JVM_PACKAGE_DEPTH + 1 < len(segs):
            return segs[i + JVM_PACKAGE_DEPTH + 1], LAYER_PACKAGE
    folders = [s for s in segs[:-1] if s.lower() not in SKIP_SEGMENTS and not _TEST_SEGMENT.search("/" + s + "/")]
    if len(folders) >= NESTED_FOLDERS:
        return folders[1], LAYER_SHARED
    if folders:
        return folders[0], LAYER_SHARED
    return ROOT_AREA, LAYER_SHARED


def _raw(path: str) -> AreaAssignment:
    """*path*'s assignment from its own segments alone."""
    area, layer = _raw_area(path.split("/"))
    return AreaAssignment(area, layer, bool(_TEST_SEGMENT.search(path)))


def _longest_name_prefix(stem: str, named: dict[str, str]) -> str | None:
    """The longest key of *named* that *stem* starts with (keys are at least ``MIN_STEM`` long), or None."""
    for end in range(len(stem), MIN_STEM - 1, -1):
        if stem[:end] in named:
            return stem[:end]
    return None


def _with_named_area(path: str, raw: AreaAssignment, named: dict[str, str]) -> AreaAssignment:
    """*raw* moved to the named area its package or file-name stem matches, if any."""
    if raw.layer == LAYER_PACKAGE and _norm(raw.area) in named:
        return replace(raw, area=named[_norm(raw.area)])
    if raw.layer in (LAYER_SHARED, LAYER_PACKAGE):
        hit = _longest_name_prefix(_norm(os.path.splitext(os.path.basename(path))[0]), named)
        if hit:
            return replace(raw, area=named[hit], layer=LAYER_STEM)
    return raw


def assign_areas(paths: Iterable[str]) -> dict[str, AreaAssignment]:
    """Every path's functional area."""
    first = {p: _raw(p) for p in paths}
    named = {_norm(a.area): a.area for a in first.values() if a.layer != LAYER_SHARED and len(_norm(a.area)) >= MIN_STEM}
    out = {path: _with_named_area(path, raw, named) for path, raw in first.items()}
    spellings: dict[str, Counter] = defaultdict(Counter)
    for a in out.values():
        spellings[_merge_key(a.area)][a.area] += 1
    return {p: replace(a, area=spellings[_merge_key(a.area)].most_common(1)[0][0]) for p, a in out.items()}
