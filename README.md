# codex-imps

Say what you want; an **imp** — a tiny [Codex SDK](https://www.npmjs.com/package/@openai/codex-sdk) agent bound to exactly one CLI tool — does it, tells you the command it ran, and vanishes. No man pages, no flags, no juggling twelve tools.

```console
$ imp "how many items are in items.json"
$ jq 'type' items.json && jq 'length' items.json     ← the command imp-jq chose (dimmed)
items.json contains 4 items. (jq filter used: length) ← the answer
⚡ imp-jq · warm · 8.3s · 7.3k tokens                  ← dim stats tail on stderr
```

You didn't name an imp. `imp` read the prompt, routed to `imp-jq`, and `imp-jq` ran real `jq` before answering — it never guesses from memory. The dim line at the bottom is on every non-interactive run: which imp, warm or cold, wall time, tokens.

The personality is a guardrail, not a vibe. Ask an imp to do something to your source files and least-privilege wins by default:

```console
$ imp "delete the audio track from intro.mp4 and overwrite it in place"
   → routes to imp-ffmpeg
```

What that looks like: `imp-ffmpeg` writes a *new* file (`intro-noaudio.mp4`) and passes `-n` so ffmpeg refuses to clobber the original — its prompt forbids `-y` and overwriting an input, and its `workspace-write` sandbox makes touching anything outside the working directory impossible, not just discouraged. It'll tell you it declined to overwrite and hand you the derived file instead. (Paraphrased — the exact wording is the model's; the never-overwrite rule is not.)

Every imp runs with ~6K input tokens instead of Codex's default ~22K — faster, cheaper, focused. Interactive mode is **on by default**; explicit non-interactive runs (`--run`, piped stdin) use a warm background imp for ~2x lower latency.

All imps start with `imp-`, so type `imp-` and tab-complete to summon the whole roster.

- **[VISION.md](./VISION.md)** — the future we're building toward and the creed every change is measured against.
- **[docs/ANATOMY.md](docs/ANATOMY.md)** — an annotated walkthrough of a real imp, top to bottom. Read this to build your own.
- **[docs/ENTERPRISE.md](docs/ENTERPRISE.md)** — the least-privilege, audit-trail, provable-behavior case for a platform or security lead.

## What is an imp?

An imp is a single executable TypeScript file that wraps one CLI tool with an isolated Codex agent. It:

- Loads **zero** user-space config (no plugins, skills, hooks, memories, or MCP servers)
- Replaces Codex's ~20K system prompt with a focused, Oracle-tuned prompt for small tool agents
- Disables unused tool schemas (Gmail, Slack, web, imagegen) via feature flags
- Symlinks only `auth.json` for login — token refreshes propagate automatically
- Uses `gpt-5.5` at `medium` reasoning effort by default
- Opens the interactive Codex TUI by default; `--run` streams non-interactive output for automation
- Cleans up on Ctrl+C — kills the agent, its commands, and temp files immediately

An imp's meaningful behavior lives in that one source file: base and developer instructions, route metadata, command maps, worked examples, workflow rules, error recovery, and response style. Shared runtime code (`lib/`) provides mechanics — isolation, warm-server reuse, the audit transcript — but never hides imp-specific behavior or policy. See [docs/ANATOMY.md](docs/ANATOMY.md) for the full teardown.

## Install

```bash
# Requires bun (https://bun.sh) and @openai/codex CLI (authenticated)
git clone https://github.com/johnlindquist/codex-imps
cd codex-imps
bun install
bun link
```

`bun link` symlinks every imp into `~/.bun/bin/`. Type `imp-` then tab to see them all. You can also run an imp directly without linking:

```bash
bun imps/imp-gh
```

The package is prepped for `npm i -g codex-imps` (or `bunx`) once published — `package.json` declares the `files`, `bin`, and `exports` needed — but git-clone + `bun link` is the current install and dev path.

## The imps

| Command | Tool | Description |
|---------|------|-------------|
| `imp-cmux` | [cmux](https://github.com/manaflow-ai/cmux) | Terminal workspace automation |
| `imp-cmux-extensions` | cmux/files | Persistent cmux extension authoring: actions, scripts, receipts, dock controls, sidebars |
| `imp-git` | [git](https://git-scm.com) | Local Git (status, diff, branches, log, stash, commit, safe sync) |
| `imp-docker` | [docker](https://docs.docker.com/engine/reference/commandline/cli/) | Containers, images, volumes, networks, Compose (guarded lifecycle) |
| `imp-npm` | [npm](https://docs.npmjs.com/cli) | Node scripts, deps, package metadata, installs, audits |
| `imp-kubectl` | [kubectl](https://kubernetes.io/docs/reference/kubectl/) | Kubernetes pods, services, logs, events, rollouts (guarded apply/delete) |
| `imp-terraform` | [terraform](https://developer.hashicorp.com/terraform/cli) | IaC init, fmt, validate, plan, state inspection (guarded apply/destroy) |
| `imp-aws` | [aws](https://docs.aws.amazon.com/cli/) | AWS identity, EC2/S3/Lambda/logs inventory (guarded mutations) |
| `imp-jq` | [jq](https://jqlang.github.io/jq/) | Inspect, filter, and transform JSON; build & test precise filters |
| `imp-rg` | [ripgrep](https://github.com/BurntSushi/ripgrep) | Fast codebase search (read-only): symbols, TODOs, imports, configs |
| `imp-psql` | [psql](https://www.postgresql.org/docs/current/app-psql.html) | PostgreSQL schema, indexes, query plans, stats, locks (guarded writes) |
| `imp-gcloud` | [gcloud](https://cloud.google.com/sdk/gcloud) | Google Cloud project/account/resource inventory (guarded mutations) |
| `imp-gh` | [gh](https://cli.github.com) | GitHub CLI (issues, PRs, releases, actions) |
| `imp-github-examples` | [gh](https://cli.github.com) | Read-only discovery of public GitHub examples: provenance, license awareness, honest counts — never vendors or writes |
| `imp-gmail` | [gog](https://github.com/johnlindquist/gog) | Gmail search/read/draft specialist using the gog CLI, no-send defaults |
| `imp-karabiner` | [goku](https://github.com/yqrashawn/GokuRakuJoTu) | Karabiner-Elements config (karabiner.edn) |
| `imp-packx` | [packx](https://www.npmjs.com/package/packx) | AI context bundling |
| `imp-faq` | codex-imps | Companion agent that answers questions about the imps themselves from the loaded repo context |
| `imp-memory` | [basic-memory](https://github.com/basicmachines-co/basic-memory) | Knowledge management |
| `imp-bird` | [bird](https://www.npmjs.com/package/bird) | Twitter/X CLI |
| `imp-browser` | [agent-browser](https://www.npmjs.com/package/agent-browser) | Browser automation (hidden/headless browser it owns) |
| `imp-browser-automate` | [agent-browser](https://www.npmjs.com/package/agent-browser) | Drives your **live** Chrome over CDP — your real tabs, logins, session |
| `imp-codex` | [codex](https://www.npmjs.com/package/@openai/codex) | Codex CLI, SDK, app-server, and codex-imps runtime maintenance |
| `imp-hooks` | codex | OpenAI Codex lifecycle hooks: create, audit, manage, and debug (UserPromptSubmit, etc.) |
| `imp-monkeys` | [agent-browser](https://www.npmjs.com/package/agent-browser) | Five-perspective browser QA swarm: finds state bugs, dead ends, console/network errors |
| `imp-demo` | — | No-tools word/phrase explainer: definitions, rhymes, usage, etymology |
| `imp-ffmpeg` | [ffmpeg](https://ffmpeg.org) | Video/audio: probe, convert, trim, scale, extract, GIFs (never overwrites inputs) |
| `imp-imagemagick` | [magick](https://imagemagick.org) | Images: identify, resize, crop, convert, montage (never overwrites originals) |
| `imp-yt-dlp` | [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Video downloads: formats, audio-only, subtitles, playlists (guarded bulk) |
| `imp-osascript` | osascript | macOS automation: apps, notifications, dialogs, clipboard, Finder (guarded UI control) |
| `imp-brew` | [brew](https://brew.sh) | Homebrew: search, info, outdated, deps (guarded install/upgrade/cleanup) |
| `imp-prompt-standard` | — | The canonical prompt-structure reference; teaches and reviews imp prompt bodies (read-only) |
| `imp-minimal` | — | Bare template for building your own |

Sandboxed imps run at the least privilege their promise needs, enforced by the runtime, not just claimed by the prompt: `imp-rg`, `imp-github-examples`, `imp-demo`, and `imp-prompt-standard` are `read-only`; `imp-jq`, `imp-packx`, `imp-ffmpeg`, and `imp-imagemagick` are `workspace-write`. The sandbox makes the dangerous thing impossible, not discouraged.

*Personal and project imps live in their own repos and register as overlays — see [Personal & overlay imps](#personal--overlay-imps).*

## Usage

Every imp opens the interactive Codex TUI by default. Pass an initial prompt to seed the session:

```bash
# Interactive TUI in this terminal
imp-gh "list my open PRs"

# Non-interactive streaming — shows commands, output, reasoning, todos, then the stats tail
imp-gh --run "list my open PRs"

# Quiet non-interactive — buffered, only the final answer on stdout
imp-gh -q "list my open PRs"

# Help
imp-gh --help

# Ctrl+C to stop at any time — kills agent + commands cleanly
```

### Pipe data in

Piped stdin is saved to a temp file and pointed out to the imp, so imps compose in pipelines:

```bash
cat data.json | imp-jq --run "how many users are on the pro plan?"
curl -s https://api.example.com/things | imp-jq --run "group these by status and count"
git log --oneline -30 | imp-git --run "summarize what shipped this week"
```

### What you see while streaming

```
$ gh pr list --author @me --state all --limit 3    ← command (dimmed)
#42 fix login bug  OPEN                            ← command output (dimmed)
#38 add search     MERGED                          ← command output (dimmed)

Your 2 most recent PRs:                            ← agent's answer (normal, stdout)
1. #42 fix login bug (open)
2. #38 add search (merged)
⚡ imp-gh · warm · 3.2s · 5.8k tokens              ← stats tail (dim, stderr)
```

Reasoning appears in dim italic; todo items show ○/✓ marks. All verbose output goes to stderr, the final answer to stdout — so `imp-gh --run "list PRs" > prs.txt` captures only the clean answer.

### The stats tail

Every non-interactive run ends with one dim stderr line — `⚡ imp-jq · warm · 8.3s · 7.3k tokens` — so the speed is felt on every call. It's stderr-only, so stdout stays pipe-clean. Suppress it with `IMP_NO_STATS=1`.

### The audit transcript

Every non-interactive run also appends one JSON line to `~/.imp/<imp>/transcripts/YYYY-MM.jsonl` recording what the imp did:

```json
{"ts":"2026-07-01T17:04:22.118Z","imp":"imp-jq","cwd":"/work","prompt":"how many items are in items.json","transport":"warm","model":"gpt-5.5","durationMs":8312,"status":"completed","commands":[{"command":"jq 'type' items.json && jq 'length' items.json","exitCode":0}],"tokens":7300,"answerChars":41}
```

It's a greppable, SIEM-shippable trail: every command with its exit code, model, transport, duration, tokens, and answer size. Writes are best-effort — an audit failure never breaks the run it's auditing. Opt out with `IMP_NO_TRANSCRIPT=1`. (`$IMP_HOME` overrides the `~/.imp` root.) See [docs/ENTERPRISE.md](docs/ENTERPRISE.md) for the full schema.

### Non-interactive warm mode

Non-interactive runs use warm mode by default. The first `--run` call to an imp auto-starts a warm background copy of itself and routes through it; later calls reuse it for instant responses. The warm imp holds **one persistent `codex app-server` process** alive, so process spawn, auth/config load, and the WebSocket connection + prewarm are paid **once**, not per prompt.

```bash
imp-gh --run "list my open PRs"        # first call spawns a warm imp, answers, leaves it warm
imp-gh --run "list my open issues"     # later calls route through the warm imp — just faster
imp-gh --no-warm "list my open PRs"    # opt out: cold in-process SDK run, no warm imp
imp-gh --serve                         # run the warm server in the foreground (for launchd/systemd)
imp-gh --run --effort minimal "..."    # per-prompt reasoning override
imp-gh --run --timeout-ms 600000 "..." # per-prompt warm turn timeout (default 300000)
```

Warm imps **shut down after 30 idle minutes** (the next call transparently respawns one). Tune with `CODEX_IMP_IDLE_MINUTES` (`0` disables). Turn timeout defaults to 300,000 ms (`--timeout-ms` per call, `CODEX_IMP_TURN_TIMEOUT_MS` globally); readiness and RPC-start waits are `CODEX_IMP_READY_TIMEOUT_MS` / `CODEX_IMP_START_TIMEOUT_MS`.

**Edits hot-reload automatically.** Every call fingerprints the imp's source — its executable plus every `lib/*.ts` module it loads — and compares it to what the running warm imp started with. If anything changed, the stale process is stopped and a fresh one spawned *before* your prompt runs. Tweak an imp's prompt, swap its model, or change shared lib code and the **very next prompt** respects the change — no manual restart.

Measured on a previous low-effort default, prompt `"say hi"`, N=8 (same session):

| Mode | Median total | Mean | Range |
|---|---|---|---|
| Cold (SDK `codex exec` per request) | 6847 ms | 7042 ms | 4656–9901 |
| Warm (app-server imp) | 3187 ms | 3108 ms | 2095–3978 |

**~2x faster.** The first protocol frame returns in ~1 ms (connection hot and waiting); the rest is pure model inference on your prompt — the one cost that can't be pre-paid. Run-to-run variance is high (backend scheduling), so collect ≥8 samples before concluding.

## Routing: `imp` and `imps`

### `imp` — summon the right imp

`imp` picks the imp from your prompt by deliberate keyword matching (free, instant, predictable — **not** a model call). The route table isn't hand-maintained: each imp declares its own `route: { pattern, hint, priority? }` in its exported `config`, and the router derives the table by scanning every imp on the machine and caching each route by file mtime. When nothing matches, or several imps tie exactly on score and priority, it lists candidates instead of guessing — on a TTY a tie offers a numbered pick.

```bash
imp "what changed in git since yesterday?"   # → imp-git
imp "trim the first 10s off intro.mp4"       # → imp-ffmpeg
imp git "what changed?"                      # explicit tool prefix, no guessing
imp --which "list my PRs"                    # print the routing decision only
imp -l                                       # list all routes (and unrouted, explicit-only imps)
```

Compound prompts route to **multiple imps, in order**. Strong connectors (`;`, `. `, `then`, `after that`) split the prompt; when every segment routes cleanly each imp runs with only its own segment:

```bash
imp "find the TODOs in src; then commit everything"
# [1/2] imp-rg: find the TODOs in src
# [2/2] imp-git: commit everything
```

A bare `and` never splits ("open a pane and cd into it" is one cmux task), consecutive segments for the same imp merge back into one call, and if *any* segment is unclear the split is abandoned for whole-prompt routing — splitting can only make routing better. A failing step stops the chain. `imp --which` prints the full plan. Flags after routing (`-q`, `--effort`, `--no-warm`) pass through.

### `imps` — manage the fleet

```bash
imps list                    # roster: every imp, warm status, pending evolutions, EVALS column
imps ps                      # warm imps: pid, uptime, idle timeout
imps stop imp-gh             # stop one warm imp (or: imps stop --all)
imps evolve                  # which imps have pending evolution suggestions
imps evolve imp-gh           # review one imp's pending suggestions
imps doctor                  # env sanity checks, eval-coverage gate, stale-socket cleanup
```

Typed `imps "do the thing"` when you meant `imp`? Anything that isn't a fleet command but looks like a prompt forwards to the `imp` router. Near-miss subcommands (`imps lis`) still show usage instead of spending a model turn.

## Personal & overlay imps

The core roster lives in this repo. Personal imps — the ones specific to *your* machine, config, and workflow — belong in **their own repo** (the pattern is `~/dev/codex-imps-personal`), so `git pull` here never touches them and sharing yours is as easy as sharing a dotfile.

The router and fleet CLI scan overlay directories in addition to core `imps/`:

- `IMPS_PATH` — colon-separated directories, highest precedence
- `~/.config/imps/dirs` — one directory per line (`#` comments allowed)

```bash
echo "$HOME/dev/codex-imps-personal/imps" >> ~/.config/imps/dirs
```

An overlay imp is an ordinary imp file that imports the runtime from the installed package:

```ts
#!/usr/bin/env bun
import { runImp, type ImpConfig } from "codex-imps/lib/isolated.ts";

export const config: ImpConfig = {
  name: "imp-mytool",
  route: { pattern: String.raw`\b(mytool|mt)\b`, hint: "my private tool" },
  baseInstructions: "You are imp-mytool …",
  developerInstructions: `…`,
};

if (import.meta.main) runImp(config);
```

It then shows up in `imp -l`, `imps list`, warm/stop/evolve — exactly like a core imp. Earlier scan dirs win name collisions.

## Evolution

Imps don't rewrite their own prompts from command failures — a failed command is usually a runtime or tooling issue, not proof the imp should mutate. Evolution is **reviewable and gated on proof** instead. Two halves: capturing signal, and closing the loop.

### Capturing signal

Each non-interactive run records a compact, redacted session trace. If the wrapper sees a bad boundary (timeout, interrupted/failed turn, no final answer) it appends a reviewable suggestion to `~/.imp/<imp>.evolutions.jsonl` — transparent and inert until reviewed. You can also mark a turn deliberately:

```bash
# +reason on the first line: save an evolution note for later (a bundled UserPromptSubmit hook records it)
imp-rg --run $'+missed the obvious parser helper\nwhere is parseArgs defined?'
```

During an interactive session, start a prompt with `^` to switch that turn into inline evolution mode — text after `^` becomes the maintainer instruction, and the hook loads Imp Evolution instructions that scope changes to *this imp's own* prompt and source (never your project files). When suggestions pile up, the next run prints a terse stderr status line (`🔁 2 evolutions pending`); at 3 it becomes `evolution review ready`. Stderr-only, so stdout stays pipe-safe.

### Closing the loop: propose → show → accept

The review side turns a pending suggestion into a concrete, testable change:

```bash
imps evolve imp-git                          # list pending suggestions with ids, evidence, session logs
imps evolve imp-git --propose <id>           # one read-only model run drafts a proposal
imps evolve imp-git --propose all            # draft one per pending suggestion
imps evolve imp-git --show <id>              # reprint a saved proposal
imps evolve imp-git --accept <id>            # apply the diff, run evals; pass keeps it, fail auto-reverts
imps evolve imp-git --applied <id|all>       # manually mark reviewed
imps evolve imp-git --dismiss <id|all>       # discard noise
```

`--propose` runs **once, non-interactively, read-only** and writes a reviewable proposal to `~/.imp/<imp>/proposals/<id>.md` — a rationale, a `git apply`-compatible diff against the imp's own source, and (when the imp has an eval suite) a regression `EvalCase` that would fail before the change and pass after. `--accept` is gated on proof: it applies the diff in the imp's git repo, runs `bun evals.ts <imp>` for real (paying model turns), and keeps the change **only if the evals pass** — on failure the diff is reverted and the suggestion stays pending. Nothing is committed for you; accept prints the `git diff` to review and commit yourself. If an imp has no eval suite, accept applies the change but flags it `SHIPS UNPROVEN` and tells you to write one.

## Evals & the trust ledger

`bun test` proves the imps *load*; **evals prove they *behave*.** Each suite in `evals/` runs real prompts against a hermetic temp-dir fixture and asserts on the answer **and** the resulting filesystem — e.g. `imp-jq` must create `users.csv` and must **not** touch `users.json`; `imp-git` must commit only the named file and leave unrelated dirty files alone. One model turn per case.

```bash
bun run evals                                 # all suites
bun evals.ts imp-jq                            # one suite
bun evals.ts imp-git --filter commit --keep    # one case, keep the sandbox for post-mortem
```

Every run records per-suite results to `~/.local/share/codex-imps/eval-results.json` — the **trust ledger**. `imps list` surfaces it as an `EVALS` column:

```
IMP                WARM   EVOLUTIONS   EVALS
imp-git            -      -            12 cases ✓ 2026-07-01
imp-jq             yes    -            3 cases ✓ 2026-07-01
imp-docker         -      2            unproven
imp-minimal        -      -            -
```

`12 cases ✓ 2026-07-01` = a full suite passed clean on that date; `unproven` = a suite exists but hasn't had a clean full run; `-` = no suite. `imps doctor` **fails** when imps lack eval suites — a guardrail without an eval is a wish, not a guarantee. Current suites: `imp-git`, `imp-jq`, `imp-rg`, `imp-ffmpeg`, `imp-imagemagick`, `imp-npm`. The same ledger gates `imps evolve --accept`.

## Create your own

Read [docs/ANATOMY.md](docs/ANATOMY.md) first — it walks a real imp end to end. Then:

```bash
# Option A: interactive generator (scaffolds the export-config + route + a starter eval suite)
bun run create        # or, after install: imp-create

# Option B: copy-paste prompt — paste docs/PROMPT.md into any AI agent with your tool's --help
# Option C: copy the template
cp imps/imp-minimal imps/imp-my-tool && chmod +x imps/imp-my-tool
```

## Prompt design

Prompts are optimized for `gpt-5.5` at `medium` reasoning effort. Key patterns (the full teardown is in [docs/ANATOMY.md](docs/ANATOMY.md)):

- **Operating rule first**: "Run [tool] via exec_command before any final answer. Do not answer from memory."
- **Command maps**: explicit IF/THEN keyword→command mappings — a small model needs literal decision shortcuts, not vague guidance.
- **Worked examples**: 3–5 few-shot examples (request → numbered exact commands → report). Small models imitate examples far better than they follow abstract rules.
- **Error-recovery maps**: exact error text → exact next command, so a failed command never dead-ends a turn.
- **Consistent structure**: every imp follows the same section order — Mission → Tool-output trust boundary → Operating rule → Command map → Workflow → Mutation policy → Worked examples → Error recovery → Command rules → Output.
- **No `--help` dumps**: a curated command map beats raw CLI reference for a focused agent.

## How isolation works

Each imp creates a temporary `CODEX_HOME` with only a symlinked `auth.json`, filtered project-trust config, and imp-owned TUI defaults. Combined with feature flags, this strips ~16K tokens of overhead:

| What's disabled | Tokens saved | Config key |
|---|---|---|
| Server-side apps (Gmail, Slack, DeepWiki) | ~14,000 | `features.apps = false` |
| Image generation | ~1,000 | `features.image_generation = false` |
| Web search | ~1,000 | `web_search = "disabled"` |
| Tool discovery | ~500 | `features.tool_search = false` |
| Model/base instructions | ~5,000 | SDK typed config: `base_instructions` |
| Skills, plugins, hooks, memories | varies | Feature flags |

See [docs/ISOLATION.md](docs/ISOLATION.md) for the full research with source line references.

## Tests

Fast, model-free smoke tests guard against arg-parsing and load regressions:

```bash
bun test
```

`test/parseargs.test.ts` exhaustively checks flag/prompt parsing; `test/cli-smoke.test.ts` loads every imp binary, checks `--help`/no-args, and confirms a real prompt survives parsing without paying a model turn.

**Push gate:** enable the pre-push hook once per clone so failing tests block a push:

```bash
git config core.hooksPath .githooks
```

(Override an individual push with `git push --no-verify`.)

## Requirements

- [Bun](https://bun.sh) v1.0+
- [Codex CLI](https://www.npmjs.com/package/@openai/codex) (authenticated — `codex auth login`)
- The CLI tool each imp wraps (e.g. `gh`, `jq`, `ffmpeg`)
