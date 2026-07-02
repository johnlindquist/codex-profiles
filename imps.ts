#!/usr/bin/env bun
/**
 * imps — manage the fleet of codex imps.
 *
 *   imps list                     roster: every imp, warm status, evolution count
 *   imps ps                       warm imps only: pid, uptime, idle timeout
 *   imps stop <name>|--all        stop warm imp(s)
 *   imps evolve [name]            pending evolution suggestions
 *   imps evolve <name> --propose <id|all>   draft a reviewable diff + regression eval
 *   imps evolve <name> --show <id>          print a saved proposal
 *   imps evolve <name> --accept <id>        apply (evals must pass), then review + commit
 *   imps init [--dir <root>]      create/update project-local ./imps runtime
 *   imps doctor                   environment sanity checks
 */
import { existsSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { basename, dirname, join, relative } from "path";
import { spawn, spawnSync } from "child_process";
import { initProjectImps, InitProjectImpsConflictError } from "./lib/init.ts";
import { impScanDirs, listImps } from "./lib/roster.ts";
import { readEvalResults } from "./evals.ts";
import { metaPath, readMeta, socketPath, stopWarmImp, tryConnect } from "./lib/imp.ts";
import { createIsolatedCodex, type ImpConfig } from "./lib/isolated.ts";
import {
  evolutionFilePath,
  evolutionTriggerPath,
  pendingEvolutionCount,
  queueDir,
  readEvolutionSuggestions,
  readEvolutionTrigger,
  statusFilePath,
  updateEvolutionSuggestionState,
  type EvolutionSuggestion,
} from "./lib/evolution.ts";
import {
  acceptProposal,
  buildProposalPrompt,
  gitRepoRoot,
  parseProposalResponse,
  proposalFilePath,
  proposalMaintainerInstructions,
  readProposalRecord,
  writeProposalFile,
  type ProposalRecord,
} from "./lib/evolution-propose.ts";

const IMPS_DIR = join(import.meta.dir, "imps");
const EVALS_DIR = join(import.meta.dir, "evals");

// Core imps plus overlay dirs (IMPS_PATH, ~/.config/imps/dirs) — personal or
// project fleets show up in list/ps/stop/evolve exactly like core imps.
const rosterMap = listImps(impScanDirs(IMPS_DIR));

function roster(): string[] {
  return [...rosterMap.keys()].sort();
}

function evalSuitePath(name: string): string {
  return join(EVALS_DIR, `${name}.ts`);
}

/** Trust column: eval coverage and the last clean full run, from the results ledger. */
function evalStatus(name: string): string {
  if (!existsSync(evalSuitePath(name))) return "-";
  const result = readEvalResults()[name];
  if (!result) return "unproven";
  const when = (result.lastCleanAt ?? "").slice(0, 10);
  if (result.failed > 0) return `${result.passed}/${result.cases} FAILING`;
  if (!result.full || !when) return `${result.cases} cases (partial)`;
  return `${result.cases} cases ✓ ${when}`;
}

async function isWarm(name: string): Promise<boolean> {
  const sock = socketPath(name);
  return existsSync(sock) && (await tryConnect(sock, 300));
}

function fmtUptime(startedAt?: number): string {
  if (!startedAt) return "?";
  const mins = Math.floor((Date.now() - startedAt) / 60_000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h${mins % 60}m`;
}

async function cmdList(): Promise<void> {
  const names = roster();
  const pad = Math.max(...names.map((n) => n.length)) + 2;
  console.log(`${"IMP".padEnd(pad)}WARM   EVOLUTIONS   EVALS`);
  for (const name of names) {
    const warm = (await isWarm(name)) ? "yes" : "-";
    const pending = pendingEvolutionCount(name) || "-";
    console.log(`${name.padEnd(pad)}${String(warm).padEnd(7)}${String(pending).padEnd(13)}${evalStatus(name)}`);
  }
}

async function cmdPs(): Promise<void> {
  const rows: string[] = [];
  for (const name of roster()) {
    if (!(await isWarm(name))) continue;
    const meta = readMeta(name);
    const idle = meta?.idleMinutes ? `${meta.idleMinutes}m idle timeout` : "no idle timeout";
    rows.push(`${name.padEnd(24)}pid ${String(meta?.pid ?? "?").padEnd(8)}up ${fmtUptime(meta?.startedAt).padEnd(8)}${idle}`);
  }
  if (rows.length === 0) {
    console.log("no warm imps");
    return;
  }
  for (const row of rows) console.log(row);
}

async function cmdStop(target?: string): Promise<void> {
  if (!target) {
    console.error("usage: imps stop <name>|--all");
    process.exit(1);
  }
  const targets = target === "--all" ? roster() : [target];
  let stopped = 0;
  for (const name of targets) {
    if (!(await isWarm(name))) continue;
    await stopWarmImp(name, readMeta(name)?.pid);
    console.log(`stopped ${name}`);
    stopped++;
  }
  if (stopped === 0) console.log(target === "--all" ? "no warm imps to stop" : `${target} is not warm`);
}

function writeJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function parseInitArgs(args: string[]): {
  dir?: string;
  force: boolean;
  noInstall: boolean;
  json: boolean;
  help: boolean;
} {
  const parsed = { dir: undefined as string | undefined, force: false, noInstall: false, json: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dir") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("usage: imps init --dir <project-root>");
      parsed.dir = value;
    } else if (arg === "--force") {
      parsed.force = true;
    } else if (arg === "--no-install") {
      parsed.noInstall = true;
    } else if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      throw new Error(`unknown imps init argument: ${arg}`);
    }
  }
  return parsed;
}

async function cmdInit(args: string[]): Promise<void> {
  let opts: ReturnType<typeof parseInitArgs>;
  try {
    opts = parseInitArgs(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (opts.help) {
    console.log(`Usage:
  imps init
  imps init --dir <project-root>
  imps init --force
  imps init --no-install
  imps init --json`);
    return;
  }

  try {
    const result = await initProjectImps({
      dir: opts.dir,
      force: opts.force,
      noInstall: opts.noInstall,
      installStdio: opts.json ? "pipe" : "inherit",
    });
    if (opts.json) {
      writeJson(result);
      return;
    }
    const created = result.files.filter((f) => f.status === "created").length;
    const updated = result.files.filter((f) => f.status === "updated").length;
    const unchanged = result.files.filter((f) => f.status === "unchanged").length;
    console.log(`initialized project-local imps runtime at ${result.impsDir}`);
    console.log(`agent import: ${result.agentImport}`);
    console.log(`runtime files: ${created} created, ${updated} updated, ${unchanged} unchanged`);
    if (!result.installed) console.log("dependency install skipped");
  } catch (error) {
    if (opts.json) {
      writeJson({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        conflicts: error instanceof InitProjectImpsConflictError ? error.conflicts : undefined,
      });
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

function listQueueFiles(): string[] {
  const dir = queueDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort();
}

function readStatusJson(name: string): unknown {
  try {
    return JSON.parse(readFileSync(statusFilePath(name), "utf8"));
  } catch {
    return null;
  }
}

function normalizeImpTarget(name: string): string {
  return name.includes("/") ? basename(name) : name;
}

async function cmdEvolve(name?: string, args: string[] = []): Promise<void> {
  const json = args.includes("--json");
  const debug = args.includes("--debug");
  if (name) name = normalizeImpTarget(name);

  if (!name) {
    const rows = [];
    for (const imp of roster()) {
      const count = pendingEvolutionCount(imp);
      if (count > 0) {
        rows.push({ imp, pending: count, evolution_file: evolutionFilePath(imp) });
      }
    }
    if (json) {
      writeJson({ imps: rows });
      return;
    }
    if (rows.length === 0) console.log("no pending imp evolutions");
    else for (const row of rows) console.log(`${row.imp.padEnd(24)}${row.pending} pending evolution${row.pending === 1 ? "" : "s"}   (${row.evolution_file})`);
    return;
  }

  const appliedIdx = args.findIndex((a) => a === "--applied" || a === "--apply");
  const dismissIdx = args.findIndex((a) => a === "--dismiss" || a === "--dismissed");
  if (appliedIdx >= 0 || dismissIdx >= 0) {
    const idx = appliedIdx >= 0 ? appliedIdx : dismissIdx;
    const state = appliedIdx >= 0 ? "applied" : "dismissed";
    const ids = args.slice(idx + 1).filter((a) => !a.startsWith("--"));
    if (ids.length === 0) {
      console.error(`usage: imps evolve ${name} --${state === "applied" ? "applied" : "dismiss"} <id|all>`);
      process.exit(1);
    }
    const changed = updateEvolutionSuggestionState(name, ids, state);
    if (json) {
      writeJson({ imp: name, state, changed });
      return;
    }
    console.log(`${name}: marked ${changed} evolution suggestion${changed === 1 ? "" : "s"} ${state}`);
    return;
  }

  if (args.includes("--propose") || args.includes("--show") || args.includes("--accept")) {
    await cmdEvolveProposal(name, args);
    return;
  }

  const suggestions = readEvolutionSuggestions(name).filter((s) => s.state === "pending");
  const trigger = readEvolutionTrigger(name);

  if (debug) {
    const queueFiles = listQueueFiles();
    const failedJobs = queueFiles.filter((file) => file.includes(".failed"));
    const runningJobs = queueFiles.filter((file) => file.includes(".running-"));
    const pendingJobs = queueFiles.filter((file) => file.endsWith(".json"));
    const payload = {
      imp: name,
      pending: suggestions.length,
      evolution_file: evolutionFilePath(name),
      status_file: statusFilePath(name),
      trigger_file: evolutionTriggerPath(name),
      trigger: trigger ?? null,
      status: readStatusJson(name),
      queue_dir: queueDir(),
      queue: {
        pending_jobs: pendingJobs,
        running_jobs: runningJobs,
        failed_jobs: failedJobs,
      },
      env: {
        IMP_HOME: process.env.IMP_HOME || null,
        IMP_EVOLUTION_DISABLED: process.env.IMP_EVOLUTION_DISABLED || null,
        IMP_EVOLUTION_INLINE: process.env.IMP_EVOLUTION_INLINE || null,
      },
    };
    if (json) {
      writeJson(payload);
      return;
    }
    console.log(`${name}: evolution debug`);
    console.log(`  pending: ${suggestions.length}`);
    console.log(`  evolution file: ${payload.evolution_file}`);
    console.log(`  status file: ${payload.status_file}`);
    console.log(`  trigger file: ${payload.trigger_file}${trigger ? " (present)" : " (absent)"}`);
    console.log(`  queue dir: ${payload.queue_dir}`);
    console.log(`  queue: ${pendingJobs.length} pending, ${runningJobs.length} running, ${failedJobs.length} failed`);
    console.log(`  env: IMP_HOME=${payload.env.IMP_HOME ?? ""} IMP_EVOLUTION_DISABLED=${payload.env.IMP_EVOLUTION_DISABLED ?? ""} IMP_EVOLUTION_INLINE=${payload.env.IMP_EVOLUTION_INLINE ?? ""}`);
    return;
  }

  if (suggestions.length === 0) {
    if (json) {
      writeJson({ imp: name, pending: [], evolution_file: evolutionFilePath(name), trigger: null });
      return;
    }
    console.log(`${name} has no pending evolutions (${evolutionFilePath(name)})`);
    return;
  }
  if (json) {
    writeJson({
      imp: name,
      pending: suggestions,
      evolution_file: evolutionFilePath(name),
      trigger: trigger ?? null,
    });
    return;
  }
  console.log(`${name}: ${suggestions.length} pending evolution${suggestions.length === 1 ? "" : "s"} in ${evolutionFilePath(name)}\n`);
  if (trigger) {
    console.log(`  review trigger: ${trigger.reason}`);
    console.log(`      review command: ${trigger.command}`);
    console.log("");
  }
  for (const s of suggestions) {
    console.log(`  ${s.id}  ${s.created_at}  score ${s.score}/${s.benchmark}  ${s.severity}`);
    console.log(`      ${s.recommendation}`);
    if (s.evidence.length > 0) console.log(`      evidence: ${s.evidence[0]}`);
    if (s.event_log_path) console.log(`      session log: ${s.event_log_path}`);
    if (s.thread_id || s.turn_id) {
      console.log(`      source: ${[s.thread_id ? `thread ${s.thread_id}` : "", s.turn_id ? `turn ${s.turn_id}` : ""].filter(Boolean).join(", ")}`);
    }
  }
  console.log(`\nDraft a reviewable diff + regression eval: imps evolve ${name} --propose <id|all>`);
  console.log(`Then apply once evals pass:                 imps evolve ${name} --accept <id>`);
  console.log(`Inspect a saved proposal:                   imps evolve ${name} --show <id>`);
  console.log(`Manually mark reviewed items:               imps evolve ${name} --applied <id|all>`);
  console.log(`To discard noise:                           imps evolve ${name} --dismiss <id|all>`);
  console.log(`For machine-readable output:                imps evolve ${name} --json`);
  console.log(`For queue/status debugging:                 imps evolve ${name} --debug`);
}

/** Read a redacted session log for the model prompt, truncated to keep turns cheap. */
function readSessionLogPreview(path?: string, max = 6000): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  try {
    const text = readFileSync(path, "utf8");
    return text.length > max ? `${text.slice(0, max)}\n... [truncated]` : text;
  } catch {
    return undefined;
  }
}

/** One non-interactive, read-only maintainer run that returns the raw proposal text. */
async function generateProposalResponse(imp: string, prompt: string): Promise<string> {
  const config: ImpConfig = {
    name: `${imp}-propose`,
    sandboxMode: "read-only",
    baseInstructions:
      "You are an imp maintainer producing one reviewable evolution proposal. You run read-only, non-interactive, once. Emit only the requested sections.",
    developerInstructions: proposalMaintainerInstructions(imp),
  };
  const { startThread, cleanup } = createIsolatedCodex(config);
  try {
    const thread = startThread({ sandboxMode: "read-only" });
    const turn = await thread.run(prompt);
    return turn.finalResponse ?? "";
  } finally {
    cleanup();
  }
}

interface ProposeOneInput {
  imp: string;
  sourcePath: string;
  sourceText: string;
  repoRoot: string;
  sourceRelPath: string;
  evalSuitePath?: string;
  evalSuiteText?: string;
  evalSuiteRelPath?: string;
  suggestion: EvolutionSuggestion;
}

async function proposeOne(input: ProposeOneInput): Promise<void> {
  const { imp, suggestion } = input;
  const prompt = buildProposalPrompt({
    imp,
    suggestion,
    sourcePath: input.sourcePath,
    sourceText: input.sourceText,
    repoRoot: input.repoRoot,
    sourceRelPath: input.sourceRelPath,
    evalSuitePath: input.evalSuitePath,
    evalSuiteText: input.evalSuiteText,
    evalSuiteRelPath: input.evalSuiteRelPath,
    sessionLogText: readSessionLogPreview(suggestion.event_log_path),
  });
  process.stderr.write(`\nDrafting proposal for ${suggestion.id} (one model run, read-only)...\n`);
  const raw = await generateProposalResponse(imp, prompt);
  const parsed = parseProposalResponse(raw);
  const createdAt = new Date().toISOString();

  if (!parsed.ok) {
    const record: ProposalRecord = {
      schema: 1,
      imp,
      id: suggestion.id,
      sourcePath: input.sourcePath,
      repoRoot: input.repoRoot,
      evalSuitePath: input.evalSuitePath,
      createdAt,
      status: "failed",
      raw,
    };
    const file = writeProposalFile(record);
    console.log(`\n${suggestion.id}: FAILED — ${parsed.reason}. Raw model output saved (not applied):`);
    console.log(`  ${file}`);
    return;
  }

  const record: ProposalRecord = {
    schema: 1,
    imp,
    id: suggestion.id,
    sourcePath: input.sourcePath,
    repoRoot: input.repoRoot,
    evalSuitePath: input.evalSuitePath,
    createdAt,
    status: "proposed",
    rationale: parsed.proposal.rationale,
    diff: parsed.proposal.diff,
    evalCase: parsed.proposal.evalCase,
  };
  const file = writeProposalFile(record);
  console.log(`\n${suggestion.id}: proposal saved to ${file}`);
  console.log(`\nRationale:\n${record.rationale}`);
  console.log(`\nDiff:\n${record.diff}`);
  if (record.evalCase) console.log(`Regression eval case:\n${record.evalCase}\n`);
  console.log(`Review it, then apply (evals must pass): imps evolve ${imp} --accept ${suggestion.id}`);
}

async function acceptProposalCmd(name: string, id: string): Promise<void> {
  const record = readProposalRecord(name, id);
  if (!record) {
    console.error(`no saved proposal for ${id}; run: imps evolve ${name} --propose ${id}`);
    process.exit(1);
  }
  if (record.status === "failed") {
    console.error(`proposal ${id} failed to parse and has no applyable diff. Re-run --propose or hand-write a diff.`);
    process.exit(1);
  }

  const evalsRunner = (imp: string) =>
    new Promise<{ code: number }>((resolve) => {
      const child = spawn("bun", [join(import.meta.dir, "evals.ts"), imp], { cwd: import.meta.dir, stdio: "inherit" });
      child.on("exit", (code, signal) => resolve({ code: signal ? 1 : code ?? 1 }));
      child.on("error", () => resolve({ code: 1 }));
    });

  const outcome = await acceptProposal(record, {
    evalsRunner,
    log: (line) => process.stderr.write(`${line}\n`),
  });

  if (outcome.ok && outcome.proven) {
    console.log(`\n${name}: ${outcome.message}`);
    console.log("Review the change and commit it yourself — nothing was committed:");
    console.log(`  git -C ${record.repoRoot} diff`);
    if (record.evalCase) {
      console.log(`If the diff did not already add it, append the regression eval case from`);
      console.log(`  ${proposalFilePath(name, id)}`);
      console.log(`to ${evalSuitePath(name)}.`);
    }
    return;
  }
  if (outcome.ok && !outcome.proven) {
    console.log(`\n\x1b[33m⚠ ${name}: ${outcome.message}\x1b[0m`);
    console.log(`\x1b[33mThis change SHIPS UNPROVEN — no eval suite exists for ${name}.\x1b[0m`);
    console.log(`Create evals/${name}.ts so future changes can be proven, then review + commit:`);
    console.log(`  git -C ${record.repoRoot} diff`);
    return;
  }

  console.error(`\n${name}: accept failed at ${outcome.stage} — ${outcome.message}`);
  if (outcome.stage === "evals") {
    console.error(`Suggestion ${id} left pending; ${outcome.reverted ? "diff reverted." : "diff NOT reverted — inspect the tree."}`);
  }
  process.exit(1);
}

async function cmdEvolveProposal(name: string, args: string[]): Promise<void> {
  const sourcePath = rosterMap.get(name);
  if (!sourcePath) {
    console.error(`imps evolve: unknown imp ${name}`);
    process.exit(1);
  }

  const showIdx = args.findIndex((a) => a === "--show");
  if (showIdx >= 0) {
    const id = args[showIdx + 1];
    if (!id || id.startsWith("--")) {
      console.error(`usage: imps evolve ${name} --show <id>`);
      process.exit(1);
    }
    const file = proposalFilePath(name, id);
    if (!existsSync(file)) {
      console.error(`no saved proposal for ${id} (${file})`);
      process.exit(1);
    }
    console.log(readFileSync(file, "utf8"));
    return;
  }

  const repoRoot = gitRepoRoot(dirname(sourcePath));
  if (!repoRoot) {
    console.error(`imps evolve: ${sourcePath} is not inside a git repository; cannot apply diffs`);
    process.exit(1);
  }

  const acceptIdx = args.findIndex((a) => a === "--accept");
  if (acceptIdx >= 0) {
    const id = args[acceptIdx + 1];
    if (!id || id.startsWith("--")) {
      console.error(`usage: imps evolve ${name} --accept <id>`);
      process.exit(1);
    }
    await acceptProposalCmd(name, id);
    return;
  }

  const proposeIdx = args.findIndex((a) => a === "--propose");
  const target = args[proposeIdx + 1];
  if (!target || target.startsWith("--")) {
    console.error(`usage: imps evolve ${name} --propose <id|all>`);
    process.exit(1);
  }

  const pending = readEvolutionSuggestions(name).filter((s) => s.state === "pending");
  const chosen = target === "all" ? pending : pending.filter((s) => s.id === target);
  if (chosen.length === 0) {
    console.error(
      target === "all"
        ? `${name} has no pending suggestions to propose`
        : `${name} has no pending suggestion ${target}`,
    );
    process.exit(1);
  }

  const sourceText = readFileSync(sourcePath, "utf8");
  const sourceRelPath = relative(repoRoot, sourcePath);
  const suitePath = evalSuitePath(name);
  const hasSuite = existsSync(suitePath);
  const suiteRel = hasSuite ? relative(repoRoot, suitePath) : "";
  // Only tell the model to touch the eval suite in-diff when it lives in the same repo.
  const evalSuiteRelPath = hasSuite && suiteRel && !suiteRel.startsWith("..") ? suiteRel : undefined;

  for (const suggestion of chosen) {
    await proposeOne({
      imp: name,
      sourcePath,
      sourceText,
      repoRoot,
      sourceRelPath,
      evalSuitePath: hasSuite ? suitePath : undefined,
      evalSuiteText: hasSuite ? readFileSync(suitePath, "utf8") : undefined,
      evalSuiteRelPath,
      suggestion,
    });
  }
}

async function cmdDoctor(): Promise<void> {
  const check = (label: string, ok: boolean, hint?: string) => {
    console.log(`${ok ? "ok  " : "FAIL"}  ${label}${!ok && hint ? `  — ${hint}` : ""}`);
    return ok;
  };
  check(`bun ${Bun.version}`, true);
  const codex = spawnSync("codex", ["--version"], { encoding: "utf8" });
  check(
    `codex CLI ${codex.status === 0 ? codex.stdout.trim() : "missing"}`,
    codex.status === 0,
    "install @openai/codex and run codex auth login",
  );
  const auth = join(process.env.HOME!, ".codex", "auth.json");
  check(`auth.json at ${auth}`, existsSync(auth), "run codex auth login");
  const names = roster();
  const dirs = impScanDirs(IMPS_DIR);
  check(`${names.length} imps across ${dirs.length} dir(s)`, names.length > 0);
  for (const dir of dirs) console.log(`      ${dir}`);
  // Creed #5: an imp without an eval suite makes unproven promises.
  const evalable = names.filter((n) => n !== "imp-minimal");
  const uncovered = evalable.filter((n) => !existsSync(evalSuitePath(n)));
  check(
    `eval coverage: ${evalable.length - uncovered.length}/${evalable.length} imps have eval suites`,
    uncovered.length === 0,
    "guardrails without evals are wishes — add evals/<imp>.ts",
  );
  if (uncovered.length > 0) console.log(`      uncovered: ${uncovered.join(", ")}`);
  let warm = 0;
  for (const name of names) if (await isWarm(name)) warm++;
  console.log(`      ${warm} warm imp(s) right now (imps ps for details)`);
  // Stale sockets: socket file exists but nothing is listening.
  for (const name of names) {
    const sock = socketPath(name);
    if (existsSync(sock) && !(await tryConnect(sock, 300))) {
      try { unlinkSync(sock); } catch {}
      try { unlinkSync(metaPath(name)); } catch {}
      console.log(`      cleaned stale socket for ${name}`);
    }
  }
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
  case "list":
  case undefined:
    await cmdList();
    break;
  case "ps":
    await cmdPs();
    break;
  case "stop":
    await cmdStop(rest[0]);
    break;
  case "evolve":
  case "evolutions":
    await cmdEvolve(rest.find((a) => !a.startsWith("--")), rest);
    break;
  case "init":
    await cmdInit(rest);
    break;
  case "doctor":
    await cmdDoctor();
    break;
  default: {
    // Free-text prompts forward to the `imp` router — `imps "open a pane..."`
    // is a near-certain typo for `imp "..."`, so make it just work. Only
    // forward what is unmistakably a prompt (an arg with spaces, or 3+ words),
    // never a near-miss subcommand like `imps lis`.
    const free = [cmd, ...(rest ?? [])].filter((a): a is string => Boolean(a));
    const looksLikePrompt =
      free.some((a) => /\s/.test(a)) || free.filter((a) => !a.startsWith("-")).length >= 3;
    if (cmd && cmd !== "--help" && cmd !== "-h" && looksLikePrompt) {
      console.error("(not a fleet command — routing via `imp`)");
      const code = await new Promise<number>((resolve) => {
        const child = spawn(join(import.meta.dir, "imp.ts"), free, { stdio: "inherit", cwd: process.cwd() });
        child.on("exit", (c, signal) => resolve(signal ? 130 : c ?? 0));
        child.on("error", () => resolve(1));
      });
      process.exit(code);
    }
    console.log(`imps — manage the fleet of codex imps

Usage:
  imps [list]                    roster: every imp, warm status, evolution count
  imps ps                        warm imps: pid, uptime, idle timeout
  imps stop <name>|--all         stop warm imp(s)
  imps evolve [name]             pending evolution suggestions
  imps init [--dir <root>]       create/update project-local ./imps runtime
  imps evolve <name> --propose <id|all>   draft a reviewable diff + regression eval
  imps evolve <name> --show <id>          print a saved proposal
  imps evolve <name> --accept <id>        apply once evals pass, then review + commit
  imps evolve <name> --applied all
  imps evolve <name> --dismiss <id>
  imps evolve <name> --json
  imps evolve <name> --debug
  imps doctor                    environment sanity checks

A free-text prompt routes via the \`imp\` router: imps "what changed in git?"`);
    process.exit(cmd && cmd !== "--help" && cmd !== "-h" ? 1 : 0);
  }
}
