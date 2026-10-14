## Code Map

The **Map** tab draws your codebase as shapes you can scan at a glance: three layouts (Circle Pack, Risk and Galaxy), and for the Circle Pack two ways to color it.

### Pick a color mode (Circle Pack)

- **Concentration** colors a circle by its issues compared with the project's average for the same size, capped by the worst severity inside it. Size is checks run.
- **Activity** colors a circle by how often its files changed, from git history or, without it, estimated from finding changes. It is unavailable for remote projects and projects with no local history.

### Pick a layout

| Key | Value |
| --- | --- |
| Circle Pack | Nested circles sized by checks run. Best for spotting heavy files at a glance. |
| Risk | Functional areas on a sky: the closer to the centre, the more an area needs rework. Two zones mark where to look first: **Fix first** in the middle, then **Watch** around it, each labelled on its ring with the number of areas it holds and sized by how much room those areas take. A solid ring around an area marks a hotspot (needs work and changes often), a dashed ring dormant debt (needs work, rarely touched). Hover an area for its numbers; click it for its details, and **View details** opens the Violations workbench filtered to that area, as one area chip. |
| Galaxy | Force-directed cluster view. Two sub-modes: filesystem (by directory) or standards (by violated principle). |

### Filter by dimension

The **Dimensions** pill in the map controls narrows every layout to the dimensions you tick. A dot on the pill reminds you a filter is active.

### Time-lapse

Under the Circle Pack and the Risk sky, the time-lapse bar plays your project's history back, one step per day with an evaluation, showing the project as it stood at the end of that day. ⏮ goes to the first day, ▶ plays (from the first day when you are on the latest one), ⏭ returns to today's map, and 1×, 2× or 4× sets the pace. The line shows the project's issue count as of each day, counted like the page header: every run of that day the header counts is included, and a dimension the day did not evaluate keeps the findings of the last run that did. Bars above the axis are new issues, bars below it fixed ones. Click the track, or use the arrow keys, Home and End on it, to pick a day.

On the Circle Pack, each day shows only the files and folders it had. The latest day is today's map; earlier days start from today's layout and close the gaps, so a folder is as big as its content was that day, and a folder holding only one folder is drawn as one circle, as on today's map. From one day to the next every circle moves with its folder: new files and folders grow in, deleted ones shrink out, and their neighbours make room. On the Risk sky, each day is drawn as the Risk tab would have drawn it that day: only the areas it had, under that day's own zones and rings. From one day to the next the areas move to their new place, new areas grow in, areas that are gone shrink out, and the rings slide to where that day puts them. An area you select stays selected while the days play, so you can follow it over time: its panel shows that day's numbers (**View details** is on today's map only). Hover shows that day's numbers on both layouts, also while it plays. While it plays, a click on the map pauses; paused, a click on a folder zooms in, and a click on an area selects it.

The time-lapse covers every dimension, so it is replaced by a short note while the Dimensions filter is on. Remote projects have no local history, so they have no time-lapse.

### Reading the views

- **Large red blocks** big files with many issues, high-impact refactor targets.
- **Clusters of red** entire modules drifting from the standard.
- **Galaxy by standards** reveals which principles are violated most across the project, regardless of where the files live.
- **Green islands**: well-maintained areas. Protect them when refactoring nearby.

### Drilling in

Click any node to drill down. The Map keeps a local breadcrumb so you can pop back without leaving the tab. Click a leaf node to open the file detail (on the Circle Pack a click selects the file, and **View details** in the panel opens it), or jump from a galaxy-by-standards cluster directly to the offending principle. On a folder, **View details** opens the Violations workbench for that folder, as one folder chip.
