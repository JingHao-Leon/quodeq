## Getting Started

The first time you launch quodeq, a welcome opens with the ways in: *A repository* to evaluate, *An evaluations repository* to connect so you can read results already published there (*Shared Repository*), and *An exported archive* to import a project exported on another machine.

### Your first evaluation

1. Press **add project** on the **Repositories** tab, or **start** on the welcome's *A repository* card.
2. Paste a git url or choose a local folder, and press **add**. For a url, quodeq keeps a working copy under `~/quodeq/repos` (set `QUODEQ_REPOS_DIR` to change that); results always live under `~/.quodeq`.
3. The panel moves on to *Who reviews it*, the AI model that reads your code. It lists the providers found on this machine in a fixed order, without recommending any of them. The selected one shows its model and effort: for Claude Code and Codex the CLI's own default model is preselected, and a provider and model you already chose in **Settings** is kept. **other providers and api keys** opens Settings when the one you want is not listed, and when none is found the step says so and offers **set one up in settings** (*AI Providers*).
4. Press **start first evaluation**. It runs every dimension with no time limit, and the **Evaluate** tab opens to follow it. You can change the dimensions and the time limit on **Evaluate** for later runs.

**later, take me to the project** closes the panel on the **Repositories** tab with the new project selected, and its Overview shows the steps to a first evaluation. It only changes your Settings when you picked a provider, model or effort on this step; leaving the preselection untouched keeps what Settings had.

For a url, the clone has to land before anything can run, so the step only offers **save and close**: your choice of reviewer is saved, a progress bar on the **Repositories** tab shows the clone with the percentage and size so far, and you start the first evaluation from the project once it is there. Closing the panel never cancels a clone. A local folder needs no clone and can start at once. Adding a folder that is already a project picks that project up again; when it has runs, the button reads **start evaluation**.

> **Drafts are saved**
>
> The panel remembers what you typed. If you close it midway, your draft comes back next time.

To see the welcome again later, open **Settings**, find *Getting started* in the *About* group and press **show welcome**.

### What happens next

- The **Evaluate** tab streams the run live, including findings as they appear.
- When a project's first run finishes cleanly while you watch it on **Evaluate**, the app moves to its **Overview**, with grades and top findings. Later runs leave you where you are.
- **Violations**, **Map**, and **History** let you drill in from different angles.
- To reach your results from another machine or share them with anyone who has access to a repository, connect an evaluations repository from the **Repositories** tab. **import evaluations** restores a previously exported archive.

### Requirements

- **Python 3.12+**. The dashboard UI ships pre-built, so Node.js is not required.
- At least one AI provider configured. See *AI Providers*.
