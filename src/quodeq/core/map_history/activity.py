"""Activity without git: a file was edited between two runs when its finding set,
over the dimensions both runs share, changed. Issue age: how long a violation's
identity has been present without a break."""
from __future__ import annotations

from quodeq.core.map_history.snapshot import RunSnapshot, finding_dimension, ids_in_dims

# More than this share of present files "changed" means the analyzer changed, not the code.
CACHE_RESET_SHARE = 0.6


def estimate_edits(prev: RunSnapshot, cur: RunSnapshot) -> set[str]:
    """Paths edited between *prev* and *cur* (new paths count; vanished ones never do)."""
    shared = set(prev.dims) & set(cur.dims)
    changed = {p for p, s in cur.files.items()
               if p in prev.files and ids_in_dims(s.ids, shared) != ids_in_dims(prev.files[p].ids, shared)}
    # A new path is an edit only when it carries a finding in a dimension both runs ran.
    new = {p for p in set(cur.files) - set(prev.files) if ids_in_dims(cur.files[p].ids, shared)}
    if len(changed | new) / max(1, len(cur.files)) > CACHE_RESET_SHARE:
        return set()
    return changed | new


def first_seen_index(snapshots: list[RunSnapshot]) -> list[dict[str, int]]:
    """Per run, every id present in it mapped to the run index where its unbroken chain started.

    A run that did not run an id's dimension cannot break its chain: the id
    keeps its start through that run (it is not listed for it).
    """
    out: list[dict[str, int]] = []
    chains: dict[str, int] = {}
    for k, snap in enumerate(snapshots):
        here = {fid: chains.get(fid, k) for stat in snap.files.values() for fid in stat.ids}
        out.append(here)
        ran = set(snap.dims)
        chains = {**{fid: start for fid, start in chains.items() if finding_dimension(fid) not in ran}, **here}
    return out
