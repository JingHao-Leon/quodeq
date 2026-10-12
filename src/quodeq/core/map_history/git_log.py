"""Pure parsing and bucketing of a ``git log --name-only -z`` listing for the map's activity."""
from __future__ import annotations

import re
from bisect import bisect_left, bisect_right
from collections import Counter

# The ``--format`` that gives each commit the header ``_HEADER`` parses.
LOG_FORMAT = "--format=%x01%ct"
# Each commit's header: a \x01 marker, then its committer time in epoch seconds.
_HEADER = re.compile(r"\x01(\d+)")
# ``-z`` ends every header and path with a NUL.
_FIELD_SEP = "\0"
# git separates a commit's header from its file list with one newline.
_LIST_SEP = "\n"
# Transition 0 is the first run, which has no earlier run to change from.
_FIRST_TRANSITION = 1


def parse_commit_log(out: str) -> list[tuple[int, list[str]]]:
    """``(committer time, paths)`` per commit of a ``LOG_FORMAT --name-only -z`` log, in log order."""
    commits: list[tuple[int, list[str]]] = []
    after_header = False
    for token in out.split(_FIELD_SEP):
        if after_header:
            token = token.removeprefix(_LIST_SEP)
        header = _HEADER.fullmatch(token)
        after_header = header is not None
        if header is not None:
            commits.append((int(header.group(1)), []))
        elif token and commits:
            commits[-1][1].append(token)
    return commits


def commits_per_transition(commits: list[tuple[int, list[str]]], starts: list[int], ends: list[int]) -> list[Counter[str]]:
    """Commits per path for each run-to-run transition (item 0 stays empty).

    *starts* and *ends* are each run day's first and last instant, ascending.
    Transition ``i`` holds a commit made between ``starts[i-1]`` and
    ``ends[i]``, both inclusive, so a commit on a run's day counts toward
    both transitions that touch that day.
    """
    per: list[Counter[str]] = [Counter() for _ in starts]
    last_run = len(starts) - 1
    for when, paths in commits:
        first = max(_FIRST_TRANSITION, bisect_left(ends, when))
        for i in range(first, min(last_run, bisect_right(starts, when)) + 1):
            per[i].update(paths)
    return per
