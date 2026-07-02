#!/usr/bin/env bun
/**
 * imp — summon the right imp for a prompt.
 *
 *   imp "what changed in git since yesterday?"   keyword-routes to imp-git
 *   imp git "what changed?"                      explicit tool prefix, no guessing
 *   imp "find the TODOs in src; then commit"     compound: imp-rg, then imp-git
 *   imp --which "list my PRs"                    print the routing decision, don't run
 *   imp -l                                       list all routes
 *
 * Routing is deliberate keyword matching, not a model call: free, instant, and
 * predictable. The route table is not hand-maintained: each imp declares its
 * own `route` metadata in its exported config, and the router derives the
 * table from every imp on the machine — the core imps/ dir plus any overlay
 * dirs registered via IMPS_PATH or ~/.config/imps/dirs (see lib/roster.ts).
 *
 * When nothing matches (or several imps tie), it lists candidates instead of
 * guessing — a wrong imp acting on a vague prompt is worse than a second
 * keystroke; on a TTY a tie offers a numbered pick. Flags after routing
 * (-q, --effort, --no-warm) pass through.
 *
 * Compound prompts: strong connectors (";", ". ", "then", "after that") split
 * the prompt, and when every segment routes cleanly to an imp the steps run
 * sequentially, each imp getting only its own segment. A bare "and" never
 * splits ("open a pane and cd into it" is one cmux task), and if ANY segment
 * is unclear the split is abandoned in favor of whole-prompt routing.
 */
import { spawn } from "child_process";
import { join } from "path";
import { createInterface } from "readline/promises";
import { impScanDirs, listImps, loadRoutes, type ImpRoute } from "./lib/roster.ts";

const IMPS_DIR = join(import.meta.dir, "imps");
const imps = listImps(impScanDirs(IMPS_DIR));

function pickRoute(prompt: string, routes: ImpRoute[]): { winner?: ImpRoute; scores: Array<{ route: ImpRoute; score: number }> } {
  const scored = routes
    .map((route) => {
      const matches = prompt.match(new RegExp(route.pattern, "gi"));
      return { route, score: matches ? matches.length : 0 };
    })
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score || b.route.priority - a.route.priority);
  if (scored.length === 0) return { scores: [] };
  // A clear winner beats the runner-up on score, or on priority within a
  // score tie; an exact tie on both is ambiguous on purpose.
  if (
    scored.length > 1 &&
    scored[0].score === scored[1].score &&
    scored[0].route.priority === scored[1].route.priority &&
    scored[0].route.name !== scored[1].route.name
  ) {
    return { scores: scored };
  }
  return { winner: scored[0].route, scores: scored };
}

interface Step {
  imp: string;
  prompt: string;
}

// Strong connectors only. A bare " and " is NOT a split point — "open a pane
// and cd into it" is one task. "." splits only when followed by whitespace, so
// file names (intro.mp4, ~/.agents) survive.
const CONNECTOR_SRC = String.raw`(?:;|\.(?=\s)|\b(?:and\s+)?then\b|\bafter\s+that\b|\bafterwards?\b)`;

function splitPrompt(prompt: string): string[] {
  return prompt
    .split(new RegExp(CONNECTOR_SRC, "gi"))
    .map((s) => s.replace(/^[\s,]+(?:and\s+)?/i, "").replace(/[\s,.]+$/, "").trim())
    .filter((s) => /[a-z]/i.test(s));
}

/**
 * Compound routing: every segment must route cleanly, consecutive segments
 * with the same imp merge back into one step, and a plan only exists when at
 * least two DIFFERENT imps are involved. Anything less falls back (null) to
 * whole-prompt routing — splitting must never make routing worse.
 */
function planRoute(prompt: string, routes: ImpRoute[]): Step[] | null {
  const segments = splitPrompt(prompt);
  if (segments.length < 2) return null;
  const steps: Step[] = [];
  for (const seg of segments) {
    const { winner } = pickRoute(seg, routes);
    if (!winner) return null;
    const prev = steps[steps.length - 1];
    if (prev && prev.imp === winner.name) prev.prompt += "; " + seg;
    else steps.push({ imp: winner.name, prompt: seg });
  }
  return steps.length >= 2 ? steps : null;
}

function runStep(imp: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const path = imps.get(imp) ?? join(IMPS_DIR, imp);
    const child = spawn(path, args, { stdio: "inherit", cwd: process.cwd() });
    child.on("exit", (code, signal) => resolve(signal ? 130 : code ?? 0));
    child.on("error", (e) => {
      console.error(`imp: failed to launch ${imp}: ${e.message}`);
      resolve(1);
    });
  });
}

function runFleet(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(join(import.meta.dir, "imps.ts"), args, { stdio: "inherit", cwd: process.cwd() });
    child.on("exit", (code, signal) => resolve(signal ? 130 : code ?? 0));
    child.on("error", (e) => {
      console.error(`imp: failed to launch imps: ${e.message}`);
      resolve(1);
    });
  });
}

function usage(): void {
  console.log(`imp — summon the right imp for a prompt

Usage:
  imp <prompt>            route by keywords and run the matching imp
  imp <tool> <prompt>     explicit: imp git "...", imp jq "..." (no guessing)
  imp "<a>; then <b>"     compound: each segment runs on its own imp, in order
  imp evolve <name>       review pending evolution suggestions through the fleet
  imp <tool> evolve       open that individual imp's evolution walkthrough
  imp --which <prompt>    print the routing decision without running
  imp -l | --list         list all routes

Routes come from each imp's own metadata; overlay dirs registered in
IMPS_PATH or ~/.config/imps/dirs are scanned too.
Flags after routing (e.g. -q, --effort, --no-warm) pass through to the imp.`);
}

const args = process.argv.slice(2);
const which = args.includes("--which");
const passthrough = args.filter((a) => a !== "--which");

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  usage();
  process.exit(0);
}

if (args[0] === "-l" || args[0] === "--list") {
  const routes = await loadRoutes(imps);
  for (const r of routes) console.log(`${r.name.padEnd(24)}${r.hint}`);
  const unrouted = [...imps.keys()].filter((n) => !routes.some((r) => r.name === n)).sort();
  if (unrouted.length) {
    console.log(`\n(no route metadata — explicit only: imp <name> "...")`);
    for (const n of unrouted) console.log(`  ${n}`);
  }
  process.exit(0);
}

if (args[0] === "evolve" || args[0] === "evolutions") {
  process.exit(await runFleet(["evolve", ...args.slice(1)]));
}

let target: string | undefined;
let impArgs = passthrough;

// Explicit tool prefix: `imp git ...` / `imp imp-git ...` routes deterministically.
const first = passthrough[0];
if (first && (imps.has(first) || imps.has(`imp-${first}`))) {
  target = imps.has(first) ? first : `imp-${first}`;
  impArgs = passthrough.slice(1);
} else {
  const routes = await loadRoutes(imps);
  const promptText = passthrough.filter((a) => !a.startsWith("-")).join(" ");
  const flagArgs = passthrough.filter((a) => a.startsWith("-"));

  const steps = planRoute(promptText, routes);
  if (steps) {
    if (which) {
      for (const s of steps) console.log(`${s.imp.padEnd(24)}${s.prompt}`);
      process.exit(0);
    }
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      console.error(`[${i + 1}/${steps.length}] ${s.imp}: ${s.prompt}`);
      const code = await runStep(s.imp, [...flagArgs, s.prompt]);
      if (code !== 0) {
        console.error(`imp: ${s.imp} exited ${code} — skipping ${steps.length - i - 1} remaining step(s)`);
        process.exit(code);
      }
    }
    process.exit(0);
  }

  const { winner, scores } = pickRoute(promptText, routes);
  if (winner) {
    target = winner.name;
  } else if (scores.length > 0) {
    const top = scores[0].score;
    const tied = scores.filter((x) => x.score === top);
    // On a TTY (and when actually running, not --which), a tie is one
    // keystroke away from resolved: offer a numbered pick.
    if (!which && process.stdin.isTTY && tied.length <= 9) {
      console.error("ambiguous — these imps all match:");
      tied.forEach((s, i) => console.error(`  ${i + 1}. ${s.route.name.padEnd(24)}${s.route.hint}`));
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      const answer = (await rl.question(`pick 1-${tied.length} (anything else cancels): `)).trim();
      rl.close();
      const idx = Number(answer) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= tied.length) process.exit(2);
      target = tied[idx].route.name;
    } else {
      console.error("ambiguous — these imps all match:");
      for (const s of tied) console.error(`  ${s.route.name.padEnd(24)}${s.route.hint}`);
      console.error(`\nbe explicit: imp ${scores[0].route.name.replace(/^imp-/, "")} "..."`);
      process.exit(2);
    }
  } else {
    console.error("no imp matched that prompt. Available imps:");
    for (const r of routes) console.error(`  ${r.name.padEnd(24)}${r.hint}`);
    console.error(`\nbe explicit: imp <tool> "your prompt"   (e.g. imp git "what changed?")`);
    process.exit(2);
  }
}

if (which) {
  console.log(target);
  process.exit(0);
}

if (impArgs.filter((a) => !a.startsWith("-")).length === 0) {
  console.error(`routed to ${target}, but no prompt remains. Try: imp ${target.replace(/^imp-/, "")} "your prompt"`);
  process.exit(1);
}

const child = spawn(imps.get(target) ?? join(IMPS_DIR, target), impArgs, { stdio: "inherit", cwd: process.cwd() });
child.on("exit", (code, signal) => process.exit(signal ? 130 : code ?? 0));
child.on("error", (e) => {
  console.error(`imp: failed to launch ${target}: ${e.message}`);
  process.exit(1);
});
