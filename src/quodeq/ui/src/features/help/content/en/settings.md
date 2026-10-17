## Settings

**Settings** is one sheet of five groups: *Evaluation*, *Assistant*, *Connections*, *App* and *About*. Each group's name sits in a gutter on the left with a line saying what it holds and its current state, for example the provider and model in use, whether you are signed in to GitHub, or the version you run. A dot beside that state marks whether all is well or something needs you. Most of it is set once and forgotten.

### Evaluation

Which AI reads your code, how long it may take, and how findings become grades.

- **AI Provider** picks who runs your evaluations: a CLI you have signed in to (Claude Code, Codex, Gemini, Copilot), a hosted API (OpenRouter or a custom OpenAI-compatible endpoint), or a local model server (Ollama, llama.cpp, oMLX). A provider that is not installed shows how to install it.
- **Model** is the model for that provider. Claude Code, Codex and GitHub Copilot list the models your account can use, and the one the CLI picks by default reads *(default)* (*Other model id* takes one that is not listed); Gemini CLI takes a typed id. A local server lists the models it has; llama.cpp shows the GGUF it has loaded. A local server's own row shows whether it is running, its address (click it to copy) and a console button for its log.
- **API key**, for hosted and some local providers, is write-only: paste a key and press **save key**. quodeq stores it outside the browser, in your system keychain by default, and the row only ever says *key saved*, with **replace** to enter a new one. The key itself is never shown again.
- **Test** checks the connection to a hosted model and reports its latency.
- **Evaluation time limit** stops a run after that long. Whatever finished in time is scored, and the next run continues from there.
- **Subagents** is how many work side by side; local servers can measure what your hardware can serve.
- **Effort**, right under the model for Claude Code and Codex, is how hard the model thinks about each file. It offers the levels the chosen model takes; **Default** leaves it to the CLI, and a change re-analyses every file on the next run.
- **Command**, on a CLI provider, is the command that launches the CLI, checked as you leave the field.

The *Results* section under the model:

- **Live findings** chooses what the live feed shows while a scan runs: **New only**, the findings this scan produces, or **All**. Findings reused from unchanged files stay in the final report either way.
- **Grade formula** opens the formula editor with **open editor ›**. Changes there rescore all runs. See the **Grade Formula** help section.

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
