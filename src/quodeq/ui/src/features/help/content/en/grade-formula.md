## Grade Formula

The grade formula turns findings into scores and letter grades. You can tune every part of it: open **Settings**, find *Grade formula* in the *Evaluation* group, and press **open editor ›**. Every change previews live across all your projects before anything is saved.

The header names the page and says how many projects it reads and which formula is in force: *Q² defaults active* or *custom formula active*.

### Three tabs

| Key | Value |
| --- | --- |
| FORMULA | The principle chart and the knobs, grouped by the question each group answers. |
| TYPES | Every requirement type of your selected project's run: its code and text, severity, the weight the draft gives it, findings now, findings at the baseline run, and whether it is open or closed. Read-only; a picker narrows it to one dimension or shows all dimensions. It needs a project with a finished run and says so otherwise. |
| DIMENSIONS | Optional per-dimension weights. Press **apply dimension weights** to use them; while it is off, the overall grade is a plain mean across dimensions. |

The *What changes* panel sits beside every tab, so you see the effect of a knob without leaving it.

### The principle chart

The chart at the top of the FORMULA tab plots every principle of every project: its finding weight across (log scale), its score up, over the grade bands, the formula's curve today and with the draft, and the two floors. While you drag, each dot moves from where the saved formula puts it to where the draft puts it, with a stem showing the move; a larger dot marks a principle that changes grade. The caption counts the principles, how many move and how many change grade. Hover a dot to see its principle, project, dimension and both scores; hovering a project in the *What changes* panel lights up its dots.

### Knobs grouped by question

Each group opens with the question it answers and says how many principles the draft's change to it moves on its own, or *unchanged*. Hovering a group highlights what it touches on the chart.

| Key | Value |
| --- | --- |
| What a finding costs | The weight of an open rule by its severity: critical, major and minor. One row is one requirement of the standard, not one finding, and a rule weighs more the more files it is broken in. The severity is the model's rating for each finding. A note says how many times a minor one a critical finding weighs. |
| Where each grade starts | Drag the dividers between CRITICAL, POOR, ADEQUATE, GOOD and EXEMPLARY (or focus one and use the arrow keys). Scores stay the same; only the labels on every gauge and badge move. |
| How fast scores fall | Steepness (strictness K): how quickly the score drops as findings pile up. |
| How much passing rules help | Lift damping (lift compress): how far the rules a principle passes pull its score back toward 10. |
| How high a score can reach | Ceiling drop (ceiling scale): the ceiling falls as findings grow, and it decides who can be Exemplary. |
| How low a score can go | The floor set by the worst open severity: one for minor only, one for majors with no critical. Criticals have no floor. |

The first two groups are always open; the other four sit under **Fine-tune**, which opens by itself when one of them is off its default. Every slider has a tick at the Q² default, and while the draft differs from the saved formula the saved value is shown struck through beside the new one.

### What changes

The panel lists every project with its overall score and grade under the saved formula and the draft, *old → new*, with a bar for the size and direction of the change. Click a project to see each of its dimensions the same way. Above the list, one line counts the projects and principles that change grade; below it, a bar compares the principle grades today with the draft. Until you move a knob it says nothing has changed yet. If your projects cannot be read, the knobs still work and **Retry** reads them again.

Under the panel, **Review and apply** opens the review sheet, **Undo all** returns the draft to the saved formula, and **RESET Q²** opens the review sheet for going back to the built-in defaults. A counter says how many settings you changed.

### Review, then apply

The review sheet comes first, for an apply and for a reset. It lists every setting that changes, with today's value, the new one, the change in percent and what it does in a sentence, then four cards: the projects whose grade flips (scored on the server), the principles that change score, how many runs will be rescored, and how to go back. Press **Apply to N runs** (or **Reset and rescore N runs**) to save, or **Keep editing** to close it. If the save fails, the sheet stays open with the error.

After a save, every run in every project is rescored in the background, newest first. The line under the editor counts it as *Rescoring N of M runs*; the sliders stay usable, and applying again restarts the pass. If some runs could not be rescored, a notice says how many and asks you to apply again. Findings and evidence are never touched; trend lines and History redraw.

> **Where you see the effect**
>
> Rescoring updates run detail pages, the accumulated overview, trend charts and project cards. The grade bands drive every gauge and badge in the app.

### When quodeq changes the formula

A quodeq update can change the grade algorithm itself. A custom formula you saved for an older algorithm is then set aside: scores use the new defaults, the editor opens on them, and the header says *Q² defaults active, older custom formula set aside*. The old file is not lost. The next time you apply or reset, quodeq first keeps a copy of it as `grade_formula.v<N>.json` next to `grade_formula.json` in `~/.quodeq`, where N is the algorithm it was made for.

### Q² defaults

| Key | Value |
| --- | --- |
| Critical weight | 7.5 |
| Major weight | 2.0 |
| Minor weight | 0.15 |
| Strictness K | 0.07 |
| Lift compress | 2.0 |
| Ceiling scale | 0.5 |
| Minor-only floor | 5.0 |
| Major floor | 2.5 |
| Grade thresholds | Exemplary 9, Good 7, Adequate 5, Poor 3 |

### Every parameter

| Key | Value |
| --- | --- |
| Severity weights | How much a rule of each severity weighs per unit of file spread; range 0.05 to 25 on a log-scaled slider, and minor stays below major, major below critical. The major weight moves grades most; the minor weight decides who reaches Exemplary; the critical weight moves little because criticals are rare. |
| Strictness K | How fast the base score falls as rule mass grows; range 0.01 to 1. Higher is harsher. |
| Lift compress | How much compliance evidence can lift the base; range 1 to 4. Higher means compliance lifts less. |
| Ceiling scale | How fast the maximum score falls with the log of the rule mass; range 0 to 2. Zero removes the ceiling. It is the main knob for the Exemplary share. |
| Severity floors | The lowest score possible when the worst open rule is minor, or major with no critical; range 0 to 10. A critical rule always floors at 0. The minor-only floor stays at or above the major floor. |
| Grade thresholds | Where Exemplary, Good, Adequate and Poor start on the 0 to 10 scale, strictly decreasing. They change the label, never the number. |
| Dimension weights | Per-dimension multipliers for the project score, range 0.1 to 3, used only while dimension weights are applied. They change the project score only. |

The *Why This Grade* page explains in words how a principle's score is built from these parameters.

Thin evidence no longer blocks a score. A principle with few observations is scored, marked as thin, and weighs little in its dimension, because the dimension score weighs each principle by how much of the code it was observed on. The formula's settings do not change which principles are marked thin.
