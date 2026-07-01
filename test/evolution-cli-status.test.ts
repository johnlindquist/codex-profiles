import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import { appendEvolutionSuggestion, makeEvolutionSuggestion } from "../lib/evolution.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempImpHome(): string {
  const root = mkdtempSync(join(tmpdir(), "imp-cli-status-"));
  roots.push(root);
  return root;
}

function withImpHome<T>(root: string, fn: () => T): T {
  const old = process.env.IMP_HOME;
  process.env.IMP_HOME = root;
  try {
    return fn();
  } finally {
    if (old === undefined) delete process.env.IMP_HOME;
    else process.env.IMP_HOME = old;
  }
}

function runBun(args: string[], impHome: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", args, {
      cwd: join(import.meta.dir, ".."),
      env: { ...process.env, IMP_HOME: impHome },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (code, signal) => resolve({ code: signal ? 130 : code ?? 0, stdout, stderr }));
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
  });
}

function seedPendingSuggestions(root: string, count: number): void {
  withImpHome(root, () => {
    for (let i = 0; i < count; i++) {
      const suggestion = makeEvolutionSuggestion({
        imp: "imp-minimal",
        prompt: `seed prompt ${i}`,
        finalText: "",
        eventLogPath: join(root, "sessions", `seed-${i}.jsonl`),
        threadId: `thread-seed-${i}`,
        turnId: `turn-seed-${i}`,
        status: "completed",
        transport: "test",
        now: new Date(`2026-06-18T12:0${i}:00Z`),
      });
      if (!suggestion) throw new Error("expected evolution suggestion");
      appendEvolutionSuggestion(suggestion);
    }
  });
}

test("CLI surfaces pending evolution status, review details, router delegation, and dismiss flow", async () => {
  const root = tempImpHome();
  seedPendingSuggestions(root, 3);

  expect(existsSync(join(root, "imp-minimal.evolutions.jsonl"))).toBe(true);
  expect(existsSync(join(root, "imp-minimal.status.json"))).toBe(true);
  expect(existsSync(join(root, "imp-minimal.evolve-request.json"))).toBe(true);

  const missingPrompt = await runBun(["imps/imp-minimal", "--run"], root);

  expect(missingPrompt.code).toBe(1);
  expect(missingPrompt.stdout).toBe("");
  expect(missingPrompt.stderr).toContain("evolution review ready: imp evolve imp-minimal");
  expect(missingPrompt.stderr).toContain("no prompt provided");

  const review = await runBun(["imps.ts", "evolve", "imp-minimal"], root);

  expect(review.code).toBe(0);
  expect(review.stderr).toBe("");
  expect(review.stdout).toContain("imp-minimal: 3 pending evolutions");
  expect(review.stdout).toContain("review trigger:");
  expect(review.stdout).toContain("review command: imp evolve imp-minimal");
  expect(review.stdout).toContain("session log:");
  expect(review.stdout).toContain("source: thread thread-seed-0, turn turn-seed-0");
  expect(review.stdout).toContain("After making any prompt/code change");
  expect(review.stdout).toContain("imps evolve imp-minimal --dismiss");
  expect(review.stdout).toContain("imps evolve imp-minimal --json");
  expect(review.stdout).toContain("imps evolve imp-minimal --debug");

  const jsonReview = await runBun(["imps.ts", "evolve", "imp-minimal", "--json"], root);

  expect(jsonReview.code).toBe(0);
  expect(jsonReview.stderr).toBe("");
  expect(JSON.parse(jsonReview.stdout).pending.length).toBe(3);

  const pathReview = await runBun(["imps.ts", "evolve", "./imps/imp-minimal"], root);

  expect(pathReview.code).toBe(0);
  expect(pathReview.stderr).toBe("");
  expect(pathReview.stdout).toContain("imp-minimal: 3 pending evolutions");

  const debug = await runBun(["imps.ts", "evolve", "imp-minimal", "--debug"], root);

  expect(debug.code).toBe(0);
  expect(debug.stderr).toBe("");
  expect(debug.stdout).toContain("imp-minimal: evolution debug");
  expect(debug.stdout).toContain("queue:");
  expect(debug.stdout).toContain("trigger file:");

  const routerReview = await runBun(["imp.ts", "evolve", "imp-minimal"], root);

  expect(routerReview.code).toBe(0);
  expect(routerReview.stderr).toBe("");
  expect(routerReview.stdout).toContain("imp-minimal: 3 pending evolutions");

  const routerPathReview = await runBun(["imp.ts", "evolve", "./imps/imp-minimal"], root);

  expect(routerPathReview.code).toBe(0);
  expect(routerPathReview.stderr).toBe("");
  expect(routerPathReview.stdout).toContain("imp-minimal: 3 pending evolutions");

  const dismiss = await runBun(["imps.ts", "evolve", "imp-minimal", "--dismiss", "all"], root);

  expect(dismiss.code).toBe(0);
  expect(dismiss.stdout).toContain("marked 3 evolution suggestions dismissed");
  expect(existsSync(join(root, "imp-minimal.evolve-request.json"))).toBe(false);
  expect(readFileSync(join(root, "imp-minimal.evolutions.jsonl"), "utf8")).toContain('"state":"dismissed"');

  const afterDismiss = await runBun(["imps/imp-minimal", "--run"], root);

  expect(afterDismiss.code).toBe(1);
  expect(afterDismiss.stdout).toBe("");
  expect(afterDismiss.stderr).not.toContain("evolutions pending");
  expect(afterDismiss.stderr).toContain("no prompt provided");
});
