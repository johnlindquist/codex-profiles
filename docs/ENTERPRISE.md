# codex-imps for platform & security teams

This page is for a platform or security lead evaluating codex-imps for a team. It states what the tool does, what it enforces versus what it merely claims, and where the gaps are — plainly, with pointers to the code. It does not oversell. Where a control is aspirational or partial, it says so.

## What this is

codex-imps is a fleet of single-purpose AI agents ("imps"), each bound to exactly one CLI tool (`git`, `jq`, `kubectl`, …). Each imp is **one readable executable file**: its identity, operating rules, command map, and safety policy are all in that file (see [ANATOMY.md](./ANATOMY.md) for a full teardown). There is no plugin system, no orchestration graph, no config sprawl — the audit surface for "what can this agent do" is one file plus a shared runtime library you can read.

Each imp runs an isolated Codex SDK session with a stripped system prompt (~6K input tokens vs. Codex's ~22K default). It runs a real command and answers from the output — it does not answer from model memory.

## Least privilege

Every imp declares a `sandboxMode` that the **runtime enforces on the Codex thread**, not just the prompt. The prompt says what the imp should do; the sandbox decides what it *can* do. In [`lib/isolated.ts`](../lib/isolated.ts) each thread starts with `sandboxMode: config.sandboxMode || "danger-full-access"` and `approvalPolicy: "never"`.

- **`read-only`** — cannot write the filesystem at all. Used by `imp-rg`, `imp-github-examples`, `imp-demo`, `imp-prompt-standard`.
- **`workspace-write`** — can write only within the working directory. Used by `imp-jq`, `imp-packx`, `imp-ffmpeg`, `imp-imagemagick`.

So `imp-rg` searching your repo *cannot* modify a file even if a prompt-injected instruction told it to, and `imp-jq` *cannot* touch anything outside the directory it was invoked in. This is the difference between a prompt that promises restraint and a sandbox that enforces it.

**Honest caveat, read this:** the default when an imp does **not** declare a `sandboxMode` is **`danger-full-access`** — full filesystem and command access, no sandbox. Many imps (including `imp-git`, `imp-docker`, `imp-kubectl`, `imp-gh`) currently run at this default and rely on their *prompt* policy (read-before-write, explicit-action-and-target, an enumerated blacklist of destructive commands) rather than a sandbox. Those prompt guardrails are real and eval-backed, but they are not an OS-level boundary. If you are adopting this in a controlled environment, treat "no declared `sandboxMode`" as "unsandboxed" and scope the imps you enable accordingly.

## Audit trail

Every non-interactive run appends one JSON line to `$IMP_HOME/<imp>/transcripts/YYYY-MM.jsonl` (default `$IMP_HOME` = `~/.imp`). It is greppable, append-only, and SIEM-shippable. The schema ([`lib/transcript.ts`](../lib/transcript.ts)):

```json
{
  "ts": "2026-07-01T17:04:22.118Z",
  "imp": "imp-jq",
  "cwd": "/work/project",
  "prompt": "how many items are in items.json",
  "transport": "warm",
  "model": "gpt-5.5",
  "durationMs": 8312,
  "status": "completed",
  "commands": [{ "command": "jq 'type' items.json && jq 'length' items.json", "exitCode": 0 }],
  "tokens": 7300,
  "answerChars": 41
}
```

- **`commands`** is the full list of shell commands the imp executed this run, each with its exit code — the answer to "what did this agent actually run."
- **`prompt`** is truncated to 2000 chars; `status` is `completed` / `failed` / `interrupted`; `transport` distinguishes the warm app-server path from cold SDK runs; `tokens` is present when the backend reports usage.
- Writes are **best-effort** — an audit-write failure never breaks the run it is auditing (so a full/unwritable disk degrades gracefully, and correspondingly the trail is not guaranteed durable under those conditions).
- Opt out per environment with `IMP_NO_TRANSCRIPT=1`.

Interactive TUI sessions do not emit these lines; the transcript covers the automatable (`--run`, `-q`, piped) surface.

## Provable behavior

Prompts claim guardrails; **evals prove them.** Each suite in `evals/` runs real model turns against a hermetic temp-dir fixture and asserts on the answer *and* the resulting filesystem — e.g. `imp-git` must commit only the named file and leave unrelated dirty files alone; `imp-jq` must create the requested output and must not touch its input.

- **Results ledger:** every eval run records per-suite pass/fail and the last clean full run to `~/.local/share/codex-imps/eval-results.json` ([`evals.ts`](../evals.ts)). `imps list` surfaces it as an `EVALS` column (`12 cases ✓ 2026-07-01`, `unproven`, or `-`).
- **Behavior changes are gated on proof:** `imps evolve <imp> --accept <id>` applies a proposed change, then runs that imp's eval suite for real; the change is kept **only if the evals pass**, and reverted otherwise ([`lib/evolution-propose.ts`](../lib/evolution-propose.ts)). Nothing is auto-committed — a human reviews the resulting `git diff`.
- **Coverage gate:** `imps doctor` **fails** when imps lack eval suites. Current suites: `imp-git`, `imp-jq`, `imp-rg`, `imp-ffmpeg`, `imp-imagemagick`, `imp-npm`. Coverage is partial today — most imps do not yet have suites, and `doctor` will flag them.

The honest reading: proof exists and gates the imps that have suites; extending coverage across the roster is ongoing.

## Isolation & token surface

Each imp runs in a throwaway `CODEX_HOME` containing only a symlinked `auth.json`, filtered project-trust config, and imp-owned TUI defaults. User-space Codex config — plugins, skills, hooks, memories, MCP servers — is **not loaded** ([`lib/isolated.ts`](../lib/isolated.ts) disables `features.apps/plugins/memories/tool_search`, sets `mcp_servers: {}`, `web_search: "disabled"`). Two consequences that matter for security:

- **No config leakage:** an imp cannot inherit an operator's MCP servers, memories, or skills. Its capability surface is what its file declares, nothing ambient.
- **Smaller surface, lower cost:** ~6K input tokens vs. ~22K default. Full research with source line references is in [ISOLATION.md](./ISOLATION.md).

## Auth

**Today, plainly:** an imp authenticates by symlinking the operator's `~/.codex/auth.json` into its throwaway `CODEX_HOME`. Every imp runs as the invoking user with that user's full Codex credentials — there is **no per-imp credential scoping**. An imp is trusted with the same auth the operator has.

**Roadmap:** per-imp credential scoping — the equivalent of a read-only IAM role per imp, so a `read-only` imp gets read-only credentials — is a stated future direction, not a current control. Do not assume credential-level least privilege exists yet; the least-privilege story today is the sandbox (above), not auth.

## Model & cost

- **Default model:** `gpt-5.5` at `medium` reasoning effort ([`lib/defaults.ts`](../lib/defaults.ts)).
- **Pinning:** set `CODEX_IMP_MODEL` to pin a model fleet-wide; an imp may also pin its own in its config. Per-prompt reasoning effort is overridable with `--effort`.
- **Cost visibility:** every non-interactive run prints a dim stats line (`⚡ imp-jq · warm · 8.3s · 7.3k tokens`, suppress with `IMP_NO_STATS=1`) and records a `tokens` field in the transcript, so per-run spend is observable and aggregatable from the JSONL trail.

## What imps never do

Design constraints, in plain terms (from [VISION.md](../VISION.md)):

- **No imp is a general agent.** An imp will not "figure out the right tool." Tool selection is the router's job (keyword matching, no model call); an imp only ever operates its one tool.
- **No framework.** No plugin system, no YAML, no orchestration graphs. An imp is one executable file.
- **No conversation.** One prompt, one answer, exit. Imps are Unix citizens: stdin in, plain text out, meaningful exit codes.
- **Safety over demo.** The design rule is boring-and-correct over clever-and-occasionally-catastrophic: read before write, preview before commit, never overwrite an input file.

## Roadmap gaps, stated honestly

These do **not** exist today. If your adoption depends on them, they are the blockers:

- **No org-level policy file.** There is no central policy an individual imp cannot override — controls live per-imp (sandbox mode, prompt) and in env vars, not in an enforced organizational config. A malicious or misconfigured overlay imp is bound only by its own declarations.
- **No service authentication.** Auth is the operator's personal `auth.json`; there is no service-account or per-imp credential model.
- **No registry.** Sharing imps is file-based (git repos, overlay dirs); there is no signed, centrally governed imp registry with provenance or approval workflow.
- **Sandbox coverage is opt-in per imp.** Until an imp declares a non-default `sandboxMode`, it runs `danger-full-access` (see *Least privilege*).

For where this is all headed, see [VISION.md](../VISION.md). For the enforcement mechanics, read [`lib/isolated.ts`](../lib/isolated.ts) — it is short, and it is the whole story.
