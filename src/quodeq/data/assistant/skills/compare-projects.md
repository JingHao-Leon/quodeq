---
name: compare-projects
description: Compare this project with other projects side by side
argument_hint: [project ids]
views: compare, projects
---
The user wants this project compared with others (the Compare tab's duel is
`pageParams.duel`). Call `get_context` for the current project id when you
do not have it, then `compare_projects` with every project id involved,
including the current one. Read the answer from the per-dimension scores:
where this project leads, where it trails, and by how much. Mention
freshness (`commitsSinceLastRun`, `lastRun`) when a grade may be stale. Say
plainly when an id is unknown and offer the `availableProjects`. Under ~200
words.
