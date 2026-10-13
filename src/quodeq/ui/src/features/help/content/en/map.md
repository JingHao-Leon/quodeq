## Code Map

The **Map** tab draws your codebase as shapes you can scan at a glance: three layouts (Circle Pack, Galaxy and Risk), and for the Circle Pack two ways to color it.

### Pick a color mode (Circle Pack)

- **Concentration** colors a circle by its issues compared with the project's average for the same size, capped by the worst severity inside it. Size is checks run.
- **Activity** colors a circle by how often its files changed, from git history or, without it, estimated from finding changes. It is unavailable for remote projects and projects with no local history.

### Pick a layout

| Key | Value |
| --- | --- |
| Circle Pack | Nested circles sized by checks run. Best for spotting heavy files at a glance. |
| Galaxy | Force-directed cluster view. Two sub-modes: filesystem (by directory) or standards (by violated principle). |
| Risk | Functional areas on a sky: the closer to the centre, the more an area needs rework. A solid ring marks a hotspot (needs work and changes often), a dashed ring dormant debt (needs work, rarely touched). Click an area for its details, the Violations workbench filtered to it, or its place in the Circle Pack. |

### Filter by dimension

The **Dimensions** pill in the map controls narrows every layout to the dimensions you tick. A dot on the pill reminds you a filter is active.

### Time-lapse

Under the Circle Pack and the Risk sky, the time-lapse bar plays your project's history back, one step per day with an evaluation, showing the project as it stood at the end of that day. ⏮ goes to the first run, ▶ plays (from the first run when you are on the latest one), ⏭ returns to today's map, and 1×, 2× or 4× sets the pace. The line shows the project's issue count as of each day, counted like the page header: every completed run that day counts, and a dimension the day did not evaluate keeps the findings of the last run that did. Bars above the axis are new issues, bars below it fixed ones. Click the track, or use the arrow keys, Home and End on it, to pick a run.

On the Circle Pack, every file and folder keeps its place inside its folder for the whole history, while folders grow and shrink with their content (the checks run inside them) and carry it along, so the map is small in the early runs and reaches today's size on the latest one. Colours blend from one run to the next as circles move; when many files appear or disappear at once, the map fades to the next run instead. On the Risk sky, areas drift towards their place for each run while the rings stay where they are, and the sky fades back to today's at the end. Files, folders and areas that are not in the run shown are drawn as dotted outlines, and their tooltip says since when they are gone or when they first appear. While it plays, a click on the map pauses; paused, hover shows that run's numbers and a click on a folder zooms in.

The time-lapse covers every dimension, so it is replaced by a short note while the Dimensions filter is on. Remote projects have no local history, so they have no time-lapse.

### Reading the views

- **Large red blocks** big files with many issues, high-impact refactor targets.
- **Clusters of red** entire modules drifting from the standard.
- **Galaxy by standards** reveals which principles are violated most across the project, regardless of where the files live.
- **Green islands**: well-maintained areas. Protect them when refactoring nearby.

### Drilling in

Click any node to drill down. The Map keeps a local breadcrumb so you can pop back without leaving the tab. Click a leaf node to open the file detail, or jump from a galaxy-by-standards cluster directly to the offending principle.
