## Overview

The **Overview** tab is a project's landing page: the accumulated quality picture plus the fastest routes into the details.

### Accumulated scores

Overview shows the latest scored result for each dimension, even when those results come from different runs. Evaluate security today and maintainability tomorrow; both appear side by side, each card labeled with the run that produced it. To inspect a single run instead, open it from *History*.

### The header

The header reads like a dimension page's, one level up:

- **The ring** the project's score with its grade word under it, and beside the name its change since the previous day, week or month (no arrow under 0.05). A shared project carries the remote badge, and a score from a tuned grade formula says so under the name.
- **The line under the name** the project's files and languages, when it was last evaluated and by which model, and a warning only when a dimension read fewer files than the project holds (as its card rounds it, under 100%).
- **Violations** active findings with severity badges, each badge with its change since the previous period. Click the stat, or a single badge, to open the project's findings as one page, filtered to that severity (see *Violations & Fix Plans*).
- **Pass rate** compliant checks over all checks. Click it to open the same page on the compliant checks.
- **Per 100 files** violations per 100 files read, averaged over the dimensions shown, and **Critical per 1k** critical findings per 1,000 files. Each tile shows its change since the previous period of the chart's grouping (the arrow follows the number, the colour says whether that is good).

Pick an older run in the score history and the header says **Viewing** that day, with **back to latest ›**.

### Since the previous period

In the header, under the project's sub line, one line says what changed since the previous day, week or month (the chart's grouping): the new and fixed findings and the rule types that appeared or went away. Each dimension is compared, finding by finding, from its own latest run with the run that closed the previous period. When nothing moved it says **no new or fixed findings**.

### Panels

- **Dimension cards** one compact card per dimension, weakest first: its name and change on top, the ring with its score, the grade word, its severities and its pass rate. A standard switched on but never evaluated shows as a dashed card that opens Evaluate. Click a card to open the dimension's page.
- **Score history and dimensions radial** side by side. The history shows the grade bands behind the bars and each run's change above it; hover or focus a card or its point on the radial and both light up.
- **Fix first** the requirements to work on first, critical ones on top. Click one to open its findings.
- **Where** beside it, the areas that need rework (the Map's Risk zones; click one to open its findings, or the map icon at the end of its row to open the Risk tab with it selected), or, one switch away, the folders that hold findings or the worst files. Click a folder or a file to open its findings.

When you pick an older run in the score history, these open the findings as of that run, read-only.

### The dimension page

Opening a dimension (a card or a radial point) shows its page in the Explorer, top to bottom:

- **The header** the dimension's score ring with its grade under it and its change since the previous period. The line under the name says what it is (a dimension), where the standard comes from (its family and edition, its version, what it is based on) and the run's date. The standard's description follows, cut to two lines with **more** to read it all. Then its numbers: violations with their severity badges, the pass rate, violations per 100 files read and critical findings per 1,000, each with its change since the previous day, week or month. Click the violations, a badge or the pass rate to open the dimension's findings on that filter. Scroll past the header and a slim bar with the name, score, violations and pass rate stays pinned under the top bar.
- **Since the previous period** the dimension's new and fixed findings and rule types since the previous day, week or month, its latest run compared with the run that closed that period.
- **Principles** one card per principle, weakest first, each with its score, grade, severities, pass rate and its change since the previous period. Up to five sit on one row, more wrap onto two. Click one to open that principle's findings as one page.
- **Score history and principles radial** side by side. Hover or focus a principle's card or its point on the radial and both light up, with its Fix first rows. Click a bar to show the dimension as of that run: the header then says **Viewing** that date, with **back to latest ›**; the radial opens a principle like its card.
- **Fix first** the dimension's requirements, most severe first. Click one to open its findings.
- **Where** beside it, first the dimension's own areas: the Map's areas measured over this dimension's findings only, fix first then watch on the same absolute lines as the Map, then the healthy ones (one dimension's findings seldom reach the lines on their own), each with how many times this dimension's average its weighted issues per file are (that figure orders the areas within a zone, it never moves one into another). Click an area to open its findings of this dimension, the map icon at the end of its row to open the Map's Risk tab filtered to this dimension with that area selected, or **Risk in Map ›** for the whole filtered sky. One switch away are the folders the dimension's findings live in (click one to open the findings list on that folder and this dimension) and its violations by file (the worst eight, then **show all**; click a row to open that file's findings).

### The report

The **Report** button in the top bar renders the whole overview as a Markdown report in the side pane, ready to download and share outside quodeq. The report opens with the header's numbers (score, violations, compliance, ratio, then criticals, majors, open types, density) and one since-baseline section with counts only. The raw violations total also appears in its summary at the end.
