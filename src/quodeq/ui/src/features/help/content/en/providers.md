## AI Providers

quodeq needs an AI model to read your code. There are three ways to supply one, and you can switch any time in **Settings**:

- **An AI CLI you already use.** Claude Code, Codex, Gemini CLI or GitHub Copilot. Its sign-in and billing apply; quodeq drives it.
- **A cloud API with your key.** OpenRouter, or any OpenAI-compatible endpoint.
- **A local model.** Ollama, llama.cpp, or omlx on Apple Silicon. Code never leaves your machine.

### Which one

| Key | Value |
| --- | --- |
| You already use Claude Code or Codex | Pick it. There is nothing to set up, and these are the models with the best measured results. |
| You want the cheapest start | OpenRouter with a small model, one key for the whole catalog. |
| Code must stay on the machine | Ollama, llama.cpp or omlx. Slower, and expect lower accuracy. |

> **What to expect from local models**
>
> On the OWASP Benchmark, quodeq with Claude Sonnet scored 0.77 (found minus false alarms); with local models such as Qwen 3.8 and Gemma 4 it scored 0.20: they find most of the real bugs but flag most safe code too, and small models report almost no compliance, which makes grades harsher. The full results are on the benchmarks page at quodeq.ai.

### CLI (Claude Code, Codex, Gemini CLI, GitHub Copilot)

Delegates to an AI CLI you already have authenticated on your machine.

1. Install and sign in to the CLI of your choice.
2. In **Settings**, *CLI Provider*, pick the binary and a model id the CLI accepts, such as `sonnet` for Claude Code or `gpt-6-sol` for Codex.
3. Optionally pin a different model per power tier (Fast, Balanced, Thorough).

#### GitHub Copilot

1. Install the Copilot CLI with `npm install -g @github/copilot`.
2. Sign in once to the profile quodeq uses: `COPILOT_HOME="$HOME/.quodeq/copilot" copilot login`. In PowerShell, set `$env:COPILOT_HOME="$HOME/.quodeq/copilot"` first, then remove it with `Remove-Item Env:COPILOT_HOME`. For Enterprise Cloud data residency, add `--host YOUR-ENTERPRISE.ghe.com`.
3. Select **GitHub Copilot** in Settings. The model list comes from your account; choose **Auto** or a specific model. No prompt is sent to a model when loading the list.

> **Policy notes**
>
> The profile is dedicated to quodeq: it does not reuse your normal Copilot login, plugins, hooks or MCP servers. Your organization's policy must allow quodeq's MCP servers, `findings` for evaluations and `quodeq-assistant` for the assistant. Login and model discovery do not verify that access; if a server is blocked, the evaluation stops with **Evaluation blocked by Copilot policy** and any completed results are kept with a partial-run warning. Model access and usage limits still apply, and the assistant's web toggle is not available with Copilot.

### Cloud (OpenRouter or a custom endpoint)

Routes through a hosted API using your key. Good when you want the latest frontier models without installing a CLI.

- **OpenRouter** one key, broad catalog. The Settings hint suggests ids from cheapest to most capable; the full catalog is on OpenRouter.
- **Custom** any OpenAI-compatible endpoint. You provide the base URL and model id.

Use **Test connection** in the provider tab to verify the key and model before launching a real run.

### Ollama (local)

Runs entirely on your machine. The trade-off is slower analysis and lower accuracy than frontier cloud models.

1. Install Ollama from `ollama.com`.
2. Pull a capable instruction model, for example `ollama pull gemma4:26b`.
3. In **Settings**, *Ollama*, your installed models appear automatically. Pick one and set the sub-agent count.

> **Picking the sub-agent count**
>
> More sub-agents finish faster but use more tokens (cloud) or more VRAM (local). For local Ollama on a 32 GB machine, start with 2 or 3 and scale up only if you have headroom.

### omlx (Apple Silicon only)

On Apple Silicon Macs an extra local option appears: **Omlx**, an MLX-native server that runs models tuned for unified memory.

1. Start the server with `omlx serve` or the omlx menu bar app.
2. In **Settings**, *Omlx*, pick a model. The list comes from your local server; add models through the omlx admin UI at `http://localhost:8000/admin`.
3. Under *Advanced* you can set a custom server address, an API key, and run the parallel-agent auto-detect, which recommends a sub-agent count based on your unified memory.

### llama.cpp (local, GGUF models)

Points quodeq at a llama-server instance you run yourself. It serves one GGUF model at a time, fixed at launch.

1. Start the server with `llama-server -m model.gguf --port 8080`.
2. In **Settings**, *llama.cpp*, the loaded model appears automatically. To switch models, restart llama-server with a different GGUF.
3. Under *Advanced*, run the parallel-agent auto-detect, which tests the server and recommends a sub-agent count.

### Power tiers

Each provider exposes three power levels that map to model size:

| Key | Value |
| --- | --- |
| Fast | Smallest tier. Good for routine runs and tight budgets. |
| Balanced | Default. Best quality-per-cost for most evaluations. |
| Thorough | Largest tier. Use for first scans, audits, or sensitive areas. |

### Without the dashboard

A headless run (`quodeq evaluate`, CI) takes the provider and model from the environment instead of Settings. See *Command Line & CI*.
