#!/usr/bin/env bun
/**
 * evals — behavioral checks for imps. PAYS REAL MODEL TURNS (one per case),
 * so it is deliberately separate from `bun test`.
 *
 *   bun evals.ts                 run every eval suite in evals/
 *   bun evals.ts imp-jq imp-rg   run specific suites
 *   bun evals.ts imp-git --filter commit   run matching cases only
 *   bun evals.ts --cold          force cold runs (no warm imp reuse)
 *   bun evals.ts --keep          keep sandbox dirs for post-mortem
 *
 * Each evals/<imp>.ts exports EvalCase[]: a prompt run in a hermetic temp dir
 * with fixtures, then an assertion over stdout + the resulting filesystem.
 * Run this after editing an imp's prompt — hot-reload means the very next eval
 * exercises the new prompt.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { dirname, join } from "path";
import { spawn } from "child_process";

/**
 * Per-imp eval results, merged after every run. This is the trust ledger:
 * `imps list` reads it to show each imp's eval coverage and last clean run,
 * and `imps evolve --accept` reads it to gate behavior changes on proof.
 */
export const EVAL_RESULTS_FILE = join(homedir(), ".local", "share", "codex-imps", "eval-results.json");

export interface EvalSuiteResult {
  cases: number;
  passed: number;
  failed: number;
  /** True when the run covered every case in the suite (no --filter). */
  full: boolean;
  lastRunAt: string;
  /** Last time a FULL run of this suite passed every case. */
  lastCleanAt?: string;
}

export function readEvalResults(): Record<string, EvalSuiteResult> {
  try {
    return JSON.parse(readFileSync(EVAL_RESULTS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function recordEvalResult(suite: string, result: Omit<EvalSuiteResult, "lastCleanAt">): void {
  const all = readEvalResults();
  const prev = all[suite];
  const lastCleanAt = result.full && result.failed === 0 ? result.lastRunAt : prev?.lastCleanAt;
  all[suite] = { ...result, ...(lastCleanAt ? { lastCleanAt } : {}) };
  try {
    mkdirSync(dirname(EVAL_RESULTS_FILE), { recursive: true });
    writeFileSync(EVAL_RESULTS_FILE, `${JSON.stringify(all, null, 2)}\n`);
  } catch {}
}

export interface EvalContext {
  stdout: string;
  stderr: string;
  dir: string;
  exitCode: number | null;
}

export interface EvalCase {
  name: string;
  prompt: string;
  /** Create fixtures inside the sandbox dir before the imp runs. */
  setup?: (dir: string) => void | Promise<void>;
  /** Return null on pass, or a human-readable failure reason. */
  check: (ctx: EvalContext) => string | null | Promise<string | null>;
  timeoutMs?: number;
}

const ROOT = import.meta.dir;
const EVALS_DIR = join(ROOT, "evals");

function runImpOnce(imp: string, prompt: string, cwd: string, cold: boolean, timeoutMs: number): Promise<EvalContext> {
  return new Promise((resolve) => {
    const args = [join(ROOT, "imps", imp), "-q", ...(cold ? ["--no-warm"] : []), prompt];
    const child = spawn("bun", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    const timer = setTimeout(() => {
      stderr += `\n[eval] timed out after ${timeoutMs}ms — killed`;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, dir: cwd, exitCode });
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cold = args.includes("--cold");
  const keep = args.includes("--keep");
  const filterIdx = args.indexOf("--filter");
  const filter = filterIdx !== -1 ? args[filterIdx + 1] : undefined;
  // Only exclude the --filter VALUE when --filter is present (filterIdx -1 would
  // otherwise make filterIdx+1 === 0 and silently drop the first suite name).
  const filterValueIdx = filterIdx !== -1 ? filterIdx + 1 : -1;
  const requested = args.filter((a, i) => !a.startsWith("--") && i !== filterValueIdx);

  const suites = readdirSync(EVALS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => f.replace(/\.ts$/, ""))
    .filter((name) => requested.length === 0 || requested.includes(name))
    .sort();

  if (suites.length === 0) {
    console.error(`no eval suites matched. Available: ${readdirSync(EVALS_DIR).join(", ")}`);
    process.exit(1);
  }

  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  for (const suite of suites) {
    const mod = await import(join(EVALS_DIR, `${suite}.ts`));
    const allCases: EvalCase[] = mod.default ?? [];
    const cases: EvalCase[] = allCases.filter((c: EvalCase) => !filter || c.name.includes(filter));
    if (cases.length === 0) continue;
    console.log(`\n${suite} (${cases.length} case${cases.length === 1 ? "" : "s"})`);
    let suitePass = 0;
    let suiteFail = 0;

    for (const c of cases) {
      const dir = mkdtempSync(join(tmpdir(), `imp-eval-${suite}-`));
      const started = Date.now();
      try {
        await c.setup?.(dir);
        const ctx = await runImpOnce(suite, c.prompt, dir, cold, c.timeoutMs ?? 180_000);
        const verdict = await c.check(ctx);
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        if (verdict === null) {
          pass++;
          suitePass++;
          console.log(`  PASS  ${c.name} (${secs}s)`);
        } else {
          fail++;
          suiteFail++;
          failures.push(`${suite} / ${c.name}: ${verdict}`);
          console.log(`  FAIL  ${c.name} (${secs}s) — ${verdict}`);
          const answer = ctx.stdout.trim().slice(0, 300);
          if (answer) console.log(`        answer: ${answer.replace(/\n/g, " | ")}`);
          const errTail = ctx.stderr.trim().slice(-300);
          if (errTail) console.log(`        stderr: ${errTail.replace(/\n/g, " | ")}`);
          if (ctx.exitCode !== 0) console.log(`        exit: ${ctx.exitCode}`);
          if (keep) console.log(`        sandbox kept: ${dir}`);
        }
      } catch (e: any) {
        fail++;
        suiteFail++;
        failures.push(`${suite} / ${c.name}: harness error ${e.message}`);
        console.log(`  FAIL  ${c.name} — harness error: ${e.message}`);
      } finally {
        if (!keep) {
          try { rmSync(dir, { recursive: true, force: true }); } catch {}
        }
      }
    }

    recordEvalResult(suite, {
      cases: cases.length,
      passed: suitePass,
      failed: suiteFail,
      full: !filter && cases.length === allCases.length,
      lastRunAt: new Date().toISOString(),
    });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

// Guarded so `imps.ts` can import readEvalResults without triggering a paid run.
if (import.meta.main) await main();
