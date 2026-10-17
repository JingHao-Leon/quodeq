## Command Line & CI

The dashboard is one subcommand of the `quodeq` CLI. The rest run headless: scripted evaluations, pull-request reviews, and machine-readable exports.

### Commands

| Key | Value |
| --- | --- |
| quodeq | Launch the dashboard. Same as `quodeq dashboard`. If one is already running, it focuses the existing window instead of starting a second server. Once the window is open the terminal is yours again; `--foreground` keeps it attached. |
| quodeq status | Show whether the window and its API are running, and which evaluations are in progress. It exits with 0 while the window or its API runs and with 3 when neither does, so a script can test it. |
| quodeq stop | Close the window and stop its API, also when the window no longer responds. Running evaluations keep going. |
| quodeq evaluate &lt;repo&gt; | Run an evaluation without the UI. Takes a path or URL. |
| quodeq review | Evaluate your current branch and post the findings as a GitHub pull request review. |
| quodeq export sarif | Convert a finished evaluation to a SARIF file. |
| quodeq ci report | Post evaluation results on a GitHub pull request from inside a CI pipeline. |

### Evaluate flags worth knowing

- `--dimensions` a comma-separated subset instead of all dimensions.
- `--branch` and `--scope` analyze a branch (via a temporary worktree) or a subdirectory.
- `--time-limit` total seconds for the run; 0 means unlimited. quodeq scores whatever finished in time.
- `--clean-scan` ignore cached findings and re-analyze every file.
- `--evidence-only` collect findings but skip scoring.
- `--diff-from <ref>` analyze only the files changed since a git ref. Evidence only, no scores: grading part of a codebase would mislead.
- `--output <dir>` write the run somewhere other than `~/.quodeq/evaluations`.

### Without the dashboard

A headless run takes its provider and model from the environment when they are set there, otherwise from what Settings saved.

| Key | Value |
| --- | --- |
| AI_PROVIDER | One of `claude`, `codex`, `gemini`, `copilot`, `openrouter`, `custom`, `ollama`, `llamacpp`. |
| AI_MODEL | The model id for that provider. `QUODEQ_MODEL_LIGHT`, `QUODEQ_MODEL_MEDIUM`, `QUODEQ_MODEL_HIGH` and `QUODEQ_MODEL_ORCHESTRATOR` pin a model per tier and take precedence. |
| AI_EFFORT | Reasoning effort for Claude Code (`low`, `medium`, `high`, `xhigh`, `max`) or Codex (`low`, `medium`, `high`, `xhigh`, `max`, `ultra`; which ones a model takes depends on the model). Unset leaves the CLI default. |
| API keys | `ANTHROPIC_API_KEY`, `CODEX_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or `AI_API_KEY` for a custom endpoint. The CLI providers use the CLI's own sign-in; Ollama and llama.cpp need no key. |
| QUODEQ_REPOS_DIR | Where clones of remote repositories go. Default `~/quodeq/repos`. |
| QUODEQ_NO_UPDATE_NOTIFIER | Set to `1` to silence the update check. It is already silent when `CI` is set. |

### Reviewing pull requests

Pull request reviews are GitHub only. `quodeq review` detects the pull request for your current branch, evaluates only the files changed against the base branch, and posts the findings as a review through the `gh` CLI. `--dry-run` builds the review without posting; `--pr` targets a specific number. GitLab merge requests are not supported yet; SARIF export works with both.

### In a pipeline

Split the work in two steps: `quodeq evaluate --diff-from` analyzes the changed files, then `quodeq ci report` posts the result with the job's `GITHUB_TOKEN`. The report needs the run directory, which sits under the output directory, so locate it first. A minimal GitHub Actions job:

```yaml
permissions:
  pull-requests: write
  contents: read
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - run: pipx install quodeq
  - name: Evaluate the changed files
    env:
      AI_PROVIDER: openrouter
      AI_MODEL: anthropic/claude-sonnet-4
      OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    run: quodeq evaluate . --diff-from "origin/${{ github.base_ref }}" --output "$RUNNER_TEMP/quodeq"
  - name: Post the review
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    run: |
      RUN_DIR=$(dirname "$(find "$RUNNER_TEMP/quodeq" -path '*/evidence' -type d | head -1)")
      quodeq ci report --evaluation-dir "$RUN_DIR" --from-evidence \
        --owner "${{ github.repository_owner }}" --repo "${{ github.event.repository.name }}" \
        --pr "${{ github.event.pull_request.number }}"
```

`quodeq ci report` exits with 1 only when it cannot post: no token, no evaluation directory, or a GitHub API error. Findings never fail the build on their own; the review and the SARIF upload are where they land. The repository's own workflow, `.github/workflows/quodeq-review.yml`, is a complete example with a time budget and a self-hosted local model.

### SARIF export

SARIF is the findings format GitHub code scanning and GitLab understand. Add `--sarif findings.sarif` to an evaluation, or convert one afterwards with `quodeq export sarif`. Use `--min-severity` to drop noise. Code snippets stay out of the file unless you pass `--with-snippets`; they leave the machine when uploaded.

> **Every command documents itself**
>
> `quodeq <command> --help` prints the full flag list, including defaults.
