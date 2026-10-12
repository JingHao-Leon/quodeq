"""Functional areas from file paths alone (no model): build modules with layer
prefixes, Features/Modules folders, the JVM package after the reverse-domain
root, name-stem matches and, last, the first meaningful folder."""
from __future__ import annotations

import os
import re
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

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
JVM_SOURCE_DIRS = ("java", "kotlin")
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


def _raw(path: str) -> tuple[str, str, bool]:
    segs = path.split("/")
    is_test = bool(_TEST_SEGMENT.search(path))
    for prefix in LAYER_PREFIXES:
        if segs[0].startswith(prefix):
            return segs[0][len(prefix):], prefix.rstrip("-"), is_test
    for i, seg in enumerate(segs[:-1]):
        if seg.lower() in FEATURE_DIRS and i + 1 < len(segs) - 1:
            return segs[i + 1], seg.lower(), is_test
    for i, seg in enumerate(segs[:-1]):
        if seg in JVM_SOURCE_DIRS and i + JVM_PACKAGE_DEPTH + 1 < len(segs):
            return segs[i + JVM_PACKAGE_DEPTH + 1], LAYER_PACKAGE, is_test
    folders = [s for s in segs[:-1] if s.lower() not in SKIP_SEGMENTS and not _TEST_SEGMENT.search("/" + s + "/")]
    if len(folders) >= NESTED_FOLDERS:
        return folders[1], LAYER_SHARED, is_test
    if folders:
        return folders[0], LAYER_SHARED, is_test
    return "(root)", LAYER_SHARED, is_test


def assign_areas(paths: Iterable[str]) -> dict[str, AreaAssignment]:
    """Every path's functional area."""
    first = {p: _raw(p) for p in paths}
    named = {_norm(a): a for a, layer, _ in first.values() if layer != LAYER_SHARED and len(_norm(a)) >= MIN_STEM}
    by_length = sorted(named, key=len, reverse=True)
    out: dict[str, list] = {}
    for path, (area, layer, is_test) in first.items():
        if layer == LAYER_PACKAGE and _norm(area) in named:
            area = named[_norm(area)]
        elif layer in (LAYER_SHARED, LAYER_PACKAGE):
            stem = _norm(os.path.splitext(os.path.basename(path))[0])
            hit = next((n for n in by_length if stem.startswith(n)), None)
            if hit:
                area, layer = named[hit], "stem"
        out[path] = [area, layer, is_test]
    spellings: dict[str, Counter] = defaultdict(Counter)
    for area, _, _ in out.values():
        spellings[_merge_key(area)][area] += 1
    return {p: AreaAssignment(spellings[_merge_key(a)].most_common(1)[0][0], layer, t)
            for p, (a, layer, t) in out.items()}
