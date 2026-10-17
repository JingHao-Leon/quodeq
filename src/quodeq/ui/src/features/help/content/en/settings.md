## Settings

**Settings** is one sheet of five groups: *Evaluation*, *Assistant*, *Connections*, *App* and *About*. Each group's name sits in a gutter on the left with a line saying what it holds and its current state, for example the provider and model in use, whether you are signed in to GitHub, or the version you run. A dot beside that state marks whether all is well or something needs you. Most of it is set once and forgotten.

### Evaluation

Which AI reads your code, how long it may take, and how findings become grades.

- **AI Provider** picks who runs your evaluations: a CLI you have signed in to (Claude Code, Codex, Gemini, Copilot), a hosted API (OpenRouter or a custom OpenAI-compatible endpoint), or a local model server (Ollama, llama.cpp, oMLX). A provider that is not installed shows how to install it.
- **Model** is the model for that provider. Claude Code, Codex and GitHub Copilot list the models your account can use, and the one the CLI picks by default reads *(default)* (*Other model id* takes one that is not listed); Gemini CLI takes a typed id. A local server lists the models it has; llama.cpp shows the GGUF it has loaded. A local server's own row shows whether it is running, its address (click it to copy) and a console button for its log.
- **API key**, for hosted and some local providers, is write-only: paste a key and press **save key**. quodeq stores it outside the browser, in your system keychain by default, and the row only ever says *key saved*, with **replace** to enter a new one. The key itself is never shown again.
- **Test** checks the connection to a hosted model and reports its latency.
- **Evaluation time limit** stops a run after that long. Whatever finished in time is scored, and the next run continues from there.
- **Max parallel agents** is how many subagents work side by side, from 1 to 10; local servers can measure what your hardware can serve.
- **Effort**, right under the model for Claude Code and Codex, is how hard the model thinks about each file. It offers the levels the chosen model takes; **Default** leaves it to the CLI, and a change re-analyses every file on the next run.
- **Command**, on a CLI provider, is the command that launches the CLI, checked as you leave the field.

The *Results* section under the model:

- **Live findings** chooses what the live feed shows while a scan runs: **New only**, the findings this scan produces, or **All**. Findings reused from unchanged files stay in the final report either way.
- **Grade formula** opens the formula editor with **open editor ›**. Changes there rescore all runs. See the **Grade Formula** help section.

- **Storage** keeps the disk use of your evaluations in check. **Space used** reads, for example, *4.2 GB of evaluations on this machine · 31 of 120 runs archived*. **clean now** first shows a preview, how many runs it would archive and about how much space that frees, and then runs in the background, counting the runs as it goes. **Clean up after start** is the off switch for the automatic cleanup. While it is on (the default), quodeq tidies finished runs and archives old ones by itself after start-up, once the scores have loaded, and **Space used** counts the runs as it goes. While it is off, nothing happens on its own and **clean now** still works. Tidying removes scratch files a finished run no longer needs and compacts its database. It applies to every finished run, the newest one included. **Archive runs untouched for** sets how old a run must be before it is archived: 3 months, 6 months (the default), 1 year, or never. Archiving compresses a run's event log, evidence and database in place, which makes those files about 76% smaller. The reports stay as they are, and grades and history do not change. A run too big to restore safely is left unpacked. The first time you open an archived run it is restored, which takes a few seconds, and it then stays unpacked for the window you chose. Lists, trends, History and the comparison with the previous period read an archived run without restoring it, so a finding you dismiss later shows in that run's grade once you open it. Applying a grade formula is the exception: it rescores every run, so it restores every archived run, and those runs then stay unpacked for the window. Cleanup waits while such a rescore runs. Cleanup never touches a project with an evaluation in progress, and it never archives the newest run of each dimension. With **never** it archives nothing new. Runs already archived stay archived and still open as usual. The first time quodeq starts with archiving and finds runs old enough, it only tidies. The Storage section then says how many runs the next start will archive and about how much space that frees, so you can choose a longer time or turn **Clean up after start** off before anything is archived. Set `QUODEQ_STORAGE_CLEANUP=0` to turn the automatic cleanup off from the environment.
- **delete all evaluation data**, in the **⋯** menu of the Storage row, removes every project's runs, findings and history from this machine. You confirm by typing `delete all`. Your repositories and settings are not touched, and it refuses while an evaluation, a clean or a grade formula rescore is running.

### Assistant

Which model answers in the assistant. **Default** follows your evaluation provider and model, **Custom** lets you choose another provider and model for the assistant alone. The assistant itself is switched on or off under *App*, in **Toolbar**.

### Connections

Your GitHub account, the evaluations repository, and the local server.

- **GitHub access** shows how quodeq reaches GitHub: signed in through quodeq, using your `gh` login, or not signed in (your own git setup). **sign in with GitHub** starts the sign-in, and **sign out** forgets only the token quodeq stored. See the **Git access** help section.
- **Shared repository** holds the address of the git repository you publish evaluations to, yours across machines or shared with anyone who has access, with **change** and **disconnect**. The **Shared Repository** help section walks through connect, publish, pull and disconnect.
- **Local server** shows the **Quodeq server** row: *Running*, *Not reachable* or *Checking…* while it asks. While it runs, the row shows its address (click it to copy), a caption with its version and PID, and a console button that opens the server log. When it is down, the row says how to start it again and that it is checked again every few seconds.

### App

How quodeq looks and which tools sit in the toolbar.

- **Appearance** sets the mode (system, light or dark) and the theme, a color palette. Themes change accent colors and surface tones; the layout stays the same.
- **Toolbar** turns the assistant (**Enable assistant**) and the terminal (**Enable terminal**) on or off. Both are on by default. **Restart terminal** closes every terminal session and opens a fresh one, after asking. See the **Assistant** and **Terminal** help sections.
- **Desktop app**, in the desktop app on macOS, has **Show menu bar icon**, which keeps quodeq in the menu bar to monitor, start and stop the dashboard even when the window is closed.

### About

The last group holds the version, updates, the welcome and links: the *Updates* section, *Getting started*, then links to the website, the repository, the blog and the changelog.

- **Getting started** has **show welcome**: it opens the welcome and the first-run steps again, even if you skipped them before. Nothing else changes; your projects and settings stay as they are. If you already have projects or a connected repository, the welcome adapts to say so, and showing it never marks onboarding as skipped.

### Updates

quodeq checks PyPI and GitHub once a day for a newer version. When one exists, a banner appears at the top of the dashboard and the *Updates* section shows the version jump plus the way to get it: the exact upgrade command for your install (pipx, uv, or Homebrew) or a download. When Quodeq knows how it was installed, an *Install* button runs that command for you, then *Restart now* loads the new version when you are ready. Install waits while evaluations run, because the upgrade replaces code they still use. Dismissing the banner silences that version; the next release brings it back.

- **check now** asks immediately, ignoring the daily throttle.
- **Automatic checks** turns the daily background check on or off.
- Set `QUODEQ_NO_UPDATE_NOTIFIER=1` to disable automatic checks and CLI notices entirely.

### After an update

The first start after an update can invalidate quodeq's score caches. The dashboard opens right away and rebuilds them in the background, newest projects first: project cards show a pulsing placeholder while their grade recomputes, and a *Refreshing scores* progress bar on the loading and Overview screens counts through the projects being prepared. Anything you open jumps the queue. If the very first request still times out, the screen offers **Retry**; retrying is safe and never duplicates work.

The same background rebuild runs whenever score caches need re-deriving for other reasons, for example after relocating a repository or clearing `~/.quodeq`.
