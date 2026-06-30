import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import { enqueueEvolutionJob, writeSessionLog, type EvolutionTelemetry } from "../lib/evolution.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempImpHome(): string {
  const root = mkdtempSync(join(tmpdir(), "imp-evaluator-"));
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

function runEvaluator(jobPath: string, impHome: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["lib/evolution-evaluator.ts", jobPath], {
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

test("standalone evaluator claims a queued job and records a pending suggestion", async () => {
  const root = tempImpHome();
  const jobPath = withImpHome(root, () => {
    const telemetry: EvolutionTelemetry = {
      imp: "imp-evo-test",
      prompt: "synthetic empty final",
      finalText: "",
      threadId: "thread-evaluator-empty",
      turnId: "turn-evaluator-empty",
      transport: "test",
      status: "completed",
      startedAt: "2026-06-18T12:00:00Z",
      completedAt: "2026-06-18T12:00:01Z",
      events: [{ type: "synthetic" }],
    };
    const eventLogPath = writeSessionLog(telemetry);
    const job = enqueueEvolutionJob("imp-evo-test", eventLogPath, new Date("2026-06-18T12:00:02Z"));
    return join(root, "evolution-queue", `${job.id}.json`);
  });

  expect(existsSync(jobPath)).toBe(true);

  const result = await runEvaluator(jobPath, root);

  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(existsSync(join(root, "sessions", "thread-evaluator-empty.jsonl"))).toBe(true);
  expect(existsSync(join(root, "imp-evo-test.evolutions.jsonl"))).toBe(true);
  expect(existsSync(join(root, "imp-evo-test.status.json"))).toBe(true);
  expect(existsSync(jobPath)).toBe(false);
  expect(readFileSync(join(root, "imp-evo-test.evolutions.jsonl"), "utf8")).toContain('"state":"pending"');
  expect(readFileSync(join(root, "imp-evo-test.evolutions.jsonl"), "utf8")).toContain("session produced no final assistant text");
});
