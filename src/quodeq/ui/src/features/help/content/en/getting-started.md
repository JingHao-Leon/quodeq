## Getting Started

The first time you launch quodeq, a welcome opens with the two ways in: a repository to evaluate, or an evaluations repository to connect so you can read results your team already published (*Shared Repository*).

### Your first evaluation

1. Press **add project** on the **Repositories** tab, or pick the first way in on the welcome.
2. Paste a git url or choose a local folder. For a url, quodeq keeps a working copy under `~/quodeq/repos` (set `QUODEQ_REPOS_DIR` to change that); results always live under `~/.quodeq`.
3. The model is the one chosen in **Settings**, else the best one found on this machine once you pick its model (*AI Providers*). The standard is the quodeq default unless you change it on **Evaluate**.
4. Press **scan and run**.

For a url, a progress bar shows the clone with the percentage and size so far, and the evaluation starts when the clone lands. A local folder needs no clone and starts at once. You can close the panel while a clone runs: it keeps going in the background and a tile on the **Repositories** tab shows the same bar. No evaluation starts for a clone you closed early.

> **Drafts are saved**
>
> The panel remembers what you typed. If you close it midway, your draft comes back next time.

To see the welcome again later, open **Settings**, find the *onboarding* section and press **show welcome**.

### What happens next

- The **Evaluate** tab streams the run live, including findings as they appear.
- When it finishes, the **Overview** tab opens with grades and top findings.
- **Violations**, **Map**, and **History** let you drill in from different angles.
- To reach your results from another machine or share them with your team, connect an evaluations repository from the **Repositories** tab. **import evaluations** restores a previously exported archive.

### Requirements

- **Python 3.12+**. The dashboard UI ships pre-built, so Node.js is not required.
- At least one AI provider configured. See *AI Providers*.
