"""Activity without git: a file was edited between two runs when its finding set,
over the dimensions both runs share, changed. Issue age: how long a violation's
identity has been present without a break."""
from __future__ import annotations

from quodeq.core.map_history.snapshot import RunSnapshot

# More than this share of present files "changed" means the analyzer changed, not the code.
CACHE_RESET_SHARE = 0.6


def _ids_in(ids: frozenset[str], dims: set[str]) -> frozenset[str]:
    return frozenset(i for i in ids if i.split(":", 1)[0] in dims)


def estimate_edits(prev: RunSnapshot, cur: RunSnapshot) -> set[str]:
    """Paths edited between *prev* and *cur* (new paths count; vanished ones never do)."""
    shared = set(prev.dims) & set(cur.dims)
    changed = {p for p, s in cur.files.items()
               if p in prev.files and _ids_in(s.ids, shared) != _ids_in(prev.files[p].ids, shared)}
    new = set(cur.files) - set(prev.files)
    if len(changed | new) / max(1, len(cur.files)) > CACHE_RESET_SHARE:
        return set()
    return changed | new


def first_seen_index(snapshots: list[RunSnapshot]) -> list[dict[str, int]]:
    """Per run, every id present in it mapped to the run index where its unbroken chain started."""
    out: list[dict[str, int]] = []
    prev: dict[str, int] = {}
    for k, snap in enumerate(snapshots):
        here: dict[str, int] = {}
        for stat in snap.files.values():
            for fid in stat.ids:
                here[fid] = prev.get(fid, k)
        out.append(here)
        prev = here
    return out
