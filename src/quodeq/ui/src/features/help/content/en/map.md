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

### Reading the views

- **Large red blocks** big files with many issues, high-impact refactor targets.
- **Clusters of red** entire modules drifting from the standard.
- **Galaxy by standards** reveals which principles are violated most across the project, regardless of where the files live.
- **Green islands**: well-maintained areas. Protect them when refactoring nearby.

### Drilling in

Click any node to drill down. The Map keeps a local breadcrumb so you can pop back without leaving the tab. Click a leaf node to open the file detail, or jump from a galaxy-by-standards cluster directly to the offending principle.
