## Settings

**Settings** is one sheet of five groups: *Model*, *Evaluation*, *Connections*, *App* and *About*. Each group's name sits in a gutter on the left with a line saying what it holds and its current state, for example the provider and model in use, whether you are signed in to GitHub, or the version you run. A dot beside that state marks whether all is well or something needs you. Most of it is set once and forgotten.

### Model

Which AI reads your code, and how long it may take.

- **AI Provider** picks who runs your evaluations: a CLI you have signed in to (Claude Code, Codex, Gemini, Copilot), a hosted API (OpenRouter or a custom OpenAI-compatible endpoint), or a local model server (Ollama, llama.cpp, oMLX). A provider that is not installed shows how to install it.
- **Model** is the model id for that provider. A local server lists the models it has; llama.cpp shows the GGUF it has loaded. A local server's own row shows whether it is running, its address (click it to copy) and a console button for its log.
- **API key**, for hosted and some local providers, is write-only: paste a key and press **save key**. quodeq stores it outside the browser, in your system keychain by default, and the row only ever says *key saved*, with **replace** to enter a new one. The key itself is never shown again.
- **Test** checks the connection to a hosted model and reports its latency.
- **Evaluation time limit** stops a run after that long. Whatever finished in time is scored, and the next run continues from there.
- **Subagents** is how many work side by side; local servers can measure what your hardware can serve.
- **Advanced**, on a CLI provider, holds **Analysis models** (a different model for the Fast, Balanced and Thorough tiers; leave one blank to use the main model), **Analysis power** (the tier evaluations use, applied right away without a reload) and **Command** (the command that launches the CLI, checked as you leave the field).

The *Assistant* section under it picks the assistant's provider and model: **Default** follows your analysis provider and model, **Custom** lets you choose another.

### Evaluation

How runs report findings and how findings become grades.

- **Live findings** chooses what the live feed shows while a scan runs: **New only**, the findings this scan produces, or **All**. Findings reused from unchanged files stay in the final report either way.
- **Grade formula** opens the formula editor with **open editor ›**. Changes there rescore all runs. See the **Grade Formula** help section.

### Connections

Your GitHub account and the evaluations repository.

- **GitHub access** shows how quodeq reaches GitHub: signed in through quodeq, using your `gh` login, or not signed in (your own git setup). **sign in with GitHub** starts the sign-in, and **sign out** forgets only the token quodeq stored. See the **Git access** help section.
- **Shared repository** holds the address of the git repository you publish evaluations to, yours across machines or shared with anyone who has access, with **change** and **disconnect**. The **Shared Repository** help section walks through connect, publish, pull and disconnect.

### App

How quodeq looks, which tools sit in the toolbar, the welcome, and the local server.

- **Appearance** sets the mode (system, light or dark) and the theme, a color palette. Themes change accent colors and surface tones; the layout stays the same.
- **Toolbar** turns the assistant (**Enable assistant**) and the terminal (**Enable terminal**) on or off. Both are on by default. **Restart terminal** closes every terminal session and opens a fresh one, after asking. See the **Assistant** and **Terminal** help sections.
- **Desktop app**, in the desktop app on macOS, has **Show menu bar icon**, which keeps quodeq in the menu bar to monitor, start and stop the dashboard even when the window is closed.
- **Getting started** has **show welcome**: it opens the welcome and the first-run steps again, even if you skipped them before. Nothing else changes; your projects and settings stay as they are. If you already have projects or a connected repository, the welcome adapts to say so, and showing it never marks onboarding as skipped.
- **Diagnostics · local server** opens to show the **Quodeq server** row: *Running*, *Not reachable* or *Checking…* while it asks. While it runs, the row shows its address (click it to copy), a caption with its version and PID, and a console button that opens the server log. When it is down, the row says how to start it again and that it is checked again every few seconds.

### About

The last group holds the version, updates and links: the *Updates* section, then links to the website, the repository, the blog and the changelog.

### Updates

quodeq checks PyPI and GitHub once a day for a newer version. When one exists, a banner appears at the top of the dashboard and the *Updates* section shows the version jump plus the way to get it: the exact upgrade command for your install (pipx, uv, or Homebrew) or a download. Dismissing the banner silences that version; the next release brings it back.

- **check now** asks immediately, ignoring the daily throttle.
- **Automatic checks** turns the daily background check on or off.
- Set `QUODEQ_NO_UPDATE_NOTIFIER=1` to disable automatic checks and CLI notices entirely.

### After an update

The first start after an update can invalidate quodeq's score caches. The dashboard opens right away and rebuilds them in the background, newest projects first: project cards show a pulsing placeholder while their grade recomputes, and a *Refreshing scores* progress bar on the loading and Overview screens counts through the projects being prepared. Anything you open jumps the queue. If the very first request still times out, the screen offers **Retry**; retrying is safe and never duplicates work.

The same background rebuild runs whenever score caches need re-deriving for other reasons, for example after relocating a repository or clearing `~/.quodeq`.
