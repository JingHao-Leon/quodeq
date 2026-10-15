---
name: explain-trend
description: Explain how a score moved over time and what moved it
argument_hint: [dimension]
views: history, overview
---
The user wants to know how the project or one dimension (usually the one in
`[ui-state]`) evolved and why. Work in this order:
1. Call `get_history`, with `dimension` when one is in play. Read the runs
   newest first: where the score or grade moved, and which dimension's
   `delta` moved with it.
2. For the biggest step, call `compare_runs` with that run as `run_id` (and
   the run before it as `against`) to name what changed: requirement types
   opened and closed, new and resolved findings by severity.
3. Explain the movement in plain words: what was fixed, what appeared, and
   whether the latest run is a partial or cancelled one (its `status`).
Lead with the direction and the size of the move, then the causes with the
requirement ids. Under ~200 words.
