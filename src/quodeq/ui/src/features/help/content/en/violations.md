## Violations & Fix Plans

The **Violations** tab is where you triage findings, read the evidence, and plan fixes. Open and dismissed findings live in one list, picked by its status.

### Severity levels

- `tag:critical` an immediate security or reliability risk.
- `tag:major` a significant quality issue.
- `tag:minor` an improvement opportunity.
- `tag:compliance` not a violation: code that follows the standard correctly. Lifts the score.

Each finding includes a file and line, a short reason, the code, and a CWE classification. Compliant findings cite the CWE the code is correctly defending against.

A *downgraded from critical* tag means the provenance gate stepped in: the finding named no reachable external input source, so it was de-escalated to major.

A *capped from major* tag is the scope gate: your declared trust model puts the finding's premise out of scope, for example remote reachability on a loopback-only service, so the severity is capped. See *Trust model and suppression rules* below.

```text
CRITICAL    src/db.py:15        SQL injection via string concatenation     CWE-89
            query = f"SELECT * FROM users WHERE id = {user_id}"

MAJOR       src/auth.py:42      Hardcoded credentials in source code       CWE-798
            credentials = {"user": "admin", "pass": "secret123"}

MINOR       src/utils.py:23     Bare except clause hides errors            CWE-396
            except: pass

COMPLIANT   src/api.py:88       Parameterized query prevents injection     CWE-89
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
```

### The workbench

Every finding of the project sits in one list, with the selected one in full beside it. Drag the line between them to give the list more or less room; the width is remembered.

- **Search** (`grep -r`) matches a finding's title, file or rule id. Its suggestions offer files and folders: pick one to narrow the list to it as a *path* chip. A finding's detail offers the same for its own file and folder.
- **severity**, **dimension**, **status** and **group** menus narrow and arrange the list. Status is *open*, *dismissed* or *all*. Group by requirement, file or dimension, or browse **folders** one level at a time with a breadcrumb back up.
- An area opened from the Map's Risk tab arrives as an *area* chip. Remove a chip, or **clear** them all, to widen the list again.
- `↑` `↓` move through the list and `/` jumps to the search.

### Drilling in

| Key | Value |
| --- | --- |
| Click a dimension | Open the Explorer with all principles, scores, and findings. |
| Click a principle | Open the principle's findings as one page, a scoped findings view (see below). |
| Click a file, folder, requirement or area | Open its findings as one page, the same kind of view. |
| Click a finding | Open the leaf finding card with breadcrumb context. |

### One file, folder or area at a time

The Overview's cards, files, requirements and folders, the Explorer's header, principles and files, and the Map's **View details** open a scoped findings view: the findings of one file, one folder (everything under it), one requirement, one dimension, one principle, one area or the whole project, read as one page. In the workbench, **open file ›** on a finding opens its file the same way. Each one is a new step, so Back returns to where you came from, and the breadcrumb names the scope: the file's name, the folder's path, the requirement, the dimension, the principle, the area, or *project*.

The header names the scope and gives its numbers. A principle leads with its score ring and reads the standard's description of it under its name. Then:

- **Violations** with their critical, major and minor counts.
- **Pass rate** the compliant checks' share of every check, with both counts under it.
- **Per 100 files** violations per 100 files, and **Critical per 1k**, critical findings per 1,000 files, the way Compare reads a project. A principle counts over the files its dimension read; any other scope over the files its findings are in. A single file has neither.
- **Risk**, on a folder or an area only: the zone its weighted findings per file put it in, measured as the Map's Risk tab measures an area. Test files are left out unless the folder holds nothing else, and with fewer than three other files it is too small to judge.

Below the header, the filters narrow the page to one severity or to the compliant checks; a view opened from a severity or a compliance number starts on that filter. The findings read by severity, with the compliant checks after the violations, or **by line**, down each file in order. **list** (the default) shows them one line each beside the selected finding in full, with a divider you can drag as in the workbench; **cards** shows every finding as a card with its code open, and findings flagged as likely false positives sit in a collapsed **Low confidence** group. Rows leave out what the page already names: inside a file they give the line only, inside a principle they leave the principle out.

Dismissing a finding from its card works as everywhere else, and the dismissal goes to the run of the finding's own dimension. A view opened from a past run (an older run picked on the Overview, a run page, a past bar in the Explorer, a past day of the Map's time-lapse) shows the findings as of that run under a banner, and is read-only: dismissing and fix plans act on today, and **Back to today** opens the same scope on today's findings.

### Fix plans

From any violation, the **Fix plan** button opens a side-pane with a structured remediation packet: file path, line number, code context, the violated principle, and concrete guidance. Copy it into your AI agent or IDE; it carries everything the model needs to apply the fix.

### Verified findings

When the assistant verifies a finding (see *Assistant*), the row gets a checkmark chip. Hover it for the verification note; click it to remove the badge.

### Dismissing a finding

If a finding is a false positive or an accepted trade-off, dismiss it from the violation detail. You will be asked for a reason. Dismissed findings:

- move to the **dismissed** status of the list,
- are **excluded from scoring** (the dimension score updates immediately),
- are **excluded from future evaluations** for the same principle and file,
- can be **restored** individually, or removed for good with *Delete*. With the **dismissed** status on and nothing else narrowing the list, the ⋯ above it holds *restore all* and *delete all* for the whole project, each asking first.

### Dismissing a whole type

Select a finding in the workbench and open the ⋯ beside **open file ›**: it offers **Dismiss all N <requirement> in this project** and **Dismiss all N <requirement> in <principle>**, and asks before it acts. These act on many findings at once, which is why they wait behind the ⋯ while the one-finding dismiss stays on the card. Each finding gets its own dismissal, written the same way as a single dismiss, so they all appear under *dismissed* and can be restored one by one or all at once. A dismissed type stops counting against the grade; the type is not closed, it is dismissed, and the Overview's open-type count no longer includes it.

### Trust model and suppression rules

Two files refine how findings are judged, beyond one-off dismissals:

- **Trust model** `.quodeq/project-profile.json` in the repo declares what the service is exposed to, e.g. `{"version": 1, "multiTenant": false, "networkExposure": "loopback", "deploymentTopology": "single-host"}`. Detection can fill in `multiTenant`, but neither network exposure nor deployment topology is ever guessed: a loopback deployment and a hosted one, and a single-host deployment and a scaled-out one, are byte-identical on disk, so only a human declaration can relax a remote-reachability or a scalability finding. Commit it and the whole team scores against the same assumptions.
- **Suppression rules** `suppression_rules.json` in the project's data directory (under `~/.quodeq/evaluations`, next to its runs) holds pattern rules: a requirement glob, a file glob, and a mandatory reason. A rule survives the code moving or being renamed, which a plain dismissal does not. There is no editor for it yet; it is a hand-written JSON file, and malformed entries are skipped rather than suppressing everything.

The run stats show how many findings the rules removed as *suppressed*.

> **Dismissals are durable**
>
> Dismissals persist across runs. They are tied to the finding's principle and file, so renaming or moving the file may bring the finding back. That is intentional. When you want a decision that follows the code around, use a suppression rule instead.
