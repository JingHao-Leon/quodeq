## Code Map

The **Map** tab draws your codebase as shapes you can scan at a glance: three layouts (Circle Pack, Risk and Galaxy), and for the Circle Pack two ways to color it.

### Pick a color mode (Circle Pack)

- **Concentration** colors a circle by its issues compared with the project's average for the same size, capped by the worst severity inside it. Size is checks run.
- **Activity** colors a circle by how often its files changed, from git history or, without it, estimated from finding changes. It is unavailable for remote projects and projects with no local history.

### Pick a layout

| Key | Value |
| --- | --- |
| Circle Pack | Nested circles sized by checks run. Best for spotting heavy files at a glance. |
| Risk | Functional areas on a sky: the closer to the centre, the more an area needs rework. Two zones mark where to look first: **Fix first** in the middle, then **Watch** around it, each labelled on its ring with the number of areas it holds and sized by how much room those areas take. A solid ring around an area marks a hotspot (needs work and changes often), a dashed ring dormant debt (needs work, rarely touched). Hover an area for its numbers; click it for its details, and **View details** opens the Violations workbench filtered to that area, as one area chip (the × on the panel clears the selection). The legend gives each zone's threshold in weighted issues per file, the colour scale of bubbles and dots (issues compared with the project's average) and what the size stands for (files). |
| Galaxy | Force-directed cluster view. Two sub-modes: filesystem (by directory) or standards (by violated principle). |

### Filter by dimension

The **Dimensions** pill in the map controls narrows every layout to the dimensions you tick. A dot on the pill reminds you a filter is active.

### Time-lapse

The **Time-lapse** switch in the map's corner turns the time-lapse on under the Circle Pack and the Risk sky. It is off until you turn it on, and the Map remembers your choice; turning it off returns the map to today. While it is on, the time-lapse sits in a dock along the bottom edge of the map and plays your project's history back, showing the project as it stood at the end of each step.

It plays by day, week or month, the same grouping as the Overview's history: change it in one place and the other follows. By day, each step is a day with an evaluation. By week or by month, each step is the end of that week or month (its last evaluation), named after the week's first day or after the month, and its bars add up the new and fixed issues of the whole week or month. Changing the grouping keeps you on the day you were looking at.

The player's buttons go to the start, one step back, play or pause (from the start when you are on today), one step forward, and back to today. Beside them the step shown is named, with its place in the history and its issue count. The small settings button on the right shows the grouping and the speed (for example "Day · 1×") and opens **Play by** (day, week or month) and the speed (1×, 2× or 4×); a click outside it, or Escape, closes it. The line shows the project's issue count as of each step, counted like the page header: every run the header counts is included, and a dimension a run did not evaluate keeps the findings of the last run that did. Bars above the axis are new issues, bars below it fixed ones, and the part of the track already played is tinted. Click the track, or use the arrow keys, Home and End on it, to pick a step.

On the Circle Pack, each day shows only the files and folders it had. The latest day is today's map; earlier days start from today's layout and close the gaps, so a folder is as big as its content was that day, and a folder holding only one folder is drawn as one circle, as on today's map. From one day to the next every circle moves with its folder: new files and folders grow in, deleted ones shrink out, and their neighbours make room. On the Risk sky, each day is drawn as the Risk tab would have drawn it that day: only the areas it had, under that day's own zones and rings. From one day to the next the areas move to their new place, new areas grow in, areas that are gone shrink out, and the rings slide to where that day puts them.

Hover shows that day's numbers on both layouts. Clicks work the same whether it plays or not: on the Circle Pack a click on a folder zooms in and a click on a file of the open folder selects it; on the Risk sky a click on an area selects it, and a click on empty sky clears the selection. What you select stays selected while the days play, so you can follow it over time: the panel in the top right corner shows its numbers for the day shown. On the Circle Pack, with no file selected, the panel shows the open folder, counting only what it held that day. **View details** is on today's map only. The × in the panel's corner clears the selection. A file you select on today's Circle Pack stays selected when the time-lapse takes over, and the other way round.

The time-lapse covers every dimension, so it is replaced by a short note while the Dimensions filter is on. Remote projects have no local history, so they have no time-lapse.

### Labels and legend

The switches in the map's corner also turn the **Labels** and the **Legend** on or off. The Legend switch hides every legend on the map, and the Map remembers it. The name of a selected circle or area is always placed first, so it is never hidden behind another label.

### Reading the views

- **Large red blocks** big files with many issues, high-impact refactor targets.
- **Clusters of red** entire modules drifting from the standard.
- **Galaxy by standards** reveals which principles are violated most across the project, regardless of where the files live.
- **Green islands**: well-maintained areas. Protect them when refactoring nearby.

### Drilling in

Click any node to drill down. The Map keeps a local breadcrumb so you can pop back without leaving the tab. Click a leaf node to open the file detail (on the Circle Pack a click selects the file, and **View details** in the panel opens it), or jump from a galaxy-by-standards cluster directly to the offending principle. On a folder, **View details** opens the Violations workbench for that folder, as one folder chip.
