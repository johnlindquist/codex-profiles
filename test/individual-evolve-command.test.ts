import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  appendEvolutionSuggestion,
  makeEvolutionSuggestion,
  type EvolutionSuggestion,
} from "../lib/evolution.ts";
import { buildEvolutionWalkthroughPrompt, type ImpConfig } from "../lib/isolated.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempImpHome(): string {
  const root = mkdtempSync(join(tmpdir(), "imp-evolve-command-"));
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

const config: ImpConfig = {
  name: "imp-minimal",
  baseInstructions: "base",
  developerInstructions: "dev",
};

test("buildEvolutionWalkthroughPrompt includes target source and pending suggestions", () => {
  const root = tempImpHome();
  let suggestion: EvolutionSuggestion | null = null;
  withImpHome(root, () => {
    suggestion = makeEvolutionSuggestion({
      imp: "imp-minimal",
      prompt: "seed prompt",
      finalText: "",
      eventLogPath: join(root, "sessions", "seed.jsonl"),
      threadId: "thread-seed",
      turnId: "turn-seed",
      status: "completed",
      transport: "test",
      now: new Date("2026-06-18T12:00:00Z"),
    });
    if (!suggestion) throw new Error("expected suggestion");
    appendEvolutionSuggestion(suggestion);
  });

  const prompt = withImpHome(root, () => buildEvolutionWalkthroughPrompt(config, "/repo/imps/imp-minimal"));

  expect(prompt).toContain("interactive evolution walkthrough for imp-minimal");
  expect(prompt).toContain("/repo/imps/imp-minimal");
  expect(prompt).toContain(join(root, "imp-minimal.evolutions.jsonl"));
  expect(prompt).toContain(suggestion!.id);
  expect(prompt).toContain("session produced no final assistant text");
  expect(prompt).toContain("thread-seed");
  expect(prompt).toContain("mark applied or dismissed");
});

test("buildEvolutionWalkthroughPrompt includes immediate brief", () => {
  const root = tempImpHome();
  const prompt = withImpHome(root, () =>
    buildEvolutionWalkthroughPrompt(config, "/repo/imps/imp-minimal", {
      immediateBrief: "improve parser recovery",
    }),
  );

  expect(prompt).toContain("Immediate evolution brief");
  expect(prompt).toContain("improve parser recovery");
});
