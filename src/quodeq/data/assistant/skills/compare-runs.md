---
name: compare-runs
description: Say what changed between two runs, finding by finding
argument_hint: [run id] [against run id]
views: history, history-run, run
---
The user wants the difference between two runs, by default the selected run
(or the newest) against each dimension's previous scoring run. Call
`compare_runs` with the ids the user gave, or none. Then report per
dimension: the new and resolved counts with their severities, the majors
and critical deltas, the requirement types opened and closed, and the first
new findings by file and line. When `sinceBaseline` is present, say how much
of the change sits in the files git changed between the two commits. Lead
with the dimensions that moved most; skip the ones with nothing new or
resolved. Under ~200 words.
