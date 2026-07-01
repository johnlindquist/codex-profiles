import { afterAll, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  appendEvolutionSuggestion,
  appendStabilization,
  enqueueEvolutionJob,
  evaluateTelemetry,
  evolutionFilePath,
  evolutionStatusLine,
  evolutionTriggerPath,
  refreshEvolutionTrigger,
  makeEvolutionSuggestion,
  parseEvolutionPromptAction,
  pendingEvolutionCount,
  readEvolutionSuggestions,
  readEvolutionTrigger,
  readStabilizations,
  redactSecrets,
  recordUserEvolutionSignal,
  statusFilePath,
  updateEvolutionSuggestionState,
  writeSessionLog,
  type EvolutionTelemetry,
} from "../lib/evolution.ts";

const root = mkdtempSync(join(tmpdir(), "evolution-"));
const oldImpHome = process.env.IMP_HOME;

beforeEach(() => {
  process.env.IMP_HOME = root;
});

afterAll(() => {
  if (oldImpHome === undefined) delete process.env.IMP_HOME;
  else process.env.IMP_HOME = oldImpHome;
  rmSync(root, { recursive: true, force: true });
});

test("clean completed sessions do not create suggestions", () => {
  expect(
    makeEvolutionSuggestion({
      imp: "imp-test",
      prompt: "say hi",
      finalText: "hi",
      status: "completed",
      transport: "test",
    }),
  ).toBeNull();
});

test("empty final answer creates a pending suggestion", () => {
  const suggestion = makeEvolutionSuggestion({
    imp: "imp-test",
    prompt: "do the thing",
    finalText: "",
    status: "completed",
    transport: "test",
    now: new Date("2026-06-18T12:00:00Z"),
  });
  expect(suggestion).not.toBeNull();
  expect(suggestion!.state).toBe("pending");
  expect(suggestion!.recommendation).toContain("final result");
  expect(appendEvolutionSuggestion(suggestion!)).toBe(true);
  expect(pendingEvolutionCount("imp-test")).toBe(1);
  expect(evolutionStatusLine("imp-test")).toContain("🔁 1 evolution pending");
  expect(existsSync(statusFilePath("imp-test"))).toBe(true);
});

test("evolution prompt action parses leading plus feedback", () => {
  const parsed = parseEvolutionPromptAction(`+This should know about github.com/johnlindquist/fusion

Please add 4 more bullet points`);
  expect(parsed.kind).toBe("context");
  if (parsed.kind !== "context") throw new Error("expected context action");
  expect(parsed.userSignal).toBe("disappointed");
  expect(parsed.userFeedback).toBe("This should know about github.com/johnlindquist/fusion");
  expect(parsed.originalPrompt).toContain("github.com/johnlindquist/fusion");
  expect(parsed.modelPrompt).toBe("Please add 4 more bullet points");
  expect(parsed.context).toContain("leading + feedback line");
});

test("evolution prompt action ignores plus signs away from the first character", () => {
  expect(parseEvolutionPromptAction("Explain C++ references\n+not feedback")).toEqual({ kind: "none" });
});

test("bare caret parses as immediate evolve request", () => {
  const parsed = parseEvolutionPromptAction(" ^ ", { impSourcePath: "/repo/imps/imp-minimal" });
  expect(parsed.kind).toBe("evolve");
  if (parsed.kind !== "evolve") throw new Error("expected evolve action");
  expect(parsed.modelPrompt).toBe("");
  expect(parsed.brief).toBe("");
  expect(parsed.context).toContain("Imp Evolution instructions");
  expect(parsed.context).toContain("Target imp source path: /repo/imps/imp-minimal");
  expect(parsed.context).toContain("inline imp evolution turn, not a normal task");
  expect(parsed.context).toContain("Hard boundary:");
  expect(parsed.context).toContain("Evolve only this specific imp");
  expect(parsed.context).toContain("Do not modify the user's project files");
  expect(parsed.context).toContain("task files");
  expect(parsed.context).toContain("generated output");
  expect(parsed.context).toContain("slides");
  expect(parsed.context).toContain("app code");
  expect(parsed.context).toContain("repository content unrelated to this imp");
  expect(parsed.context).toContain("Primary target:");
  expect(parsed.context).toContain("Default to editing this imp's own prompt/instructions only");
  expect(parsed.context).toContain("base instructions");
  expect(parsed.context).toContain("developer instructions");
  expect(parsed.context).toContain("command maps");
  expect(parsed.context).toContain("error-recovery guidance");
  expect(parsed.context).toContain("response behavior");
  expect(parsed.context).toContain("Narrow exception:");
  expect(parsed.context).toContain("Touch non-prompt imp-owned files only when");
  expect(parsed.context).toContain("cannot be satisfied by prompt/instruction changes alone");
  expect(parsed.context).toContain("Touch shared imp runtime only when");
  expect(parsed.context).toContain("genuinely shared across imps");
  expect(parsed.context).toContain("Do not redesign evolution machinery");
  expect(parsed.context).toContain("Required workflow:");
  expect(parsed.context).toContain("Inspect the target imp source path before editing");
  expect(parsed.context).toContain("Preserve unrelated dirty work");
  expect(parsed.context).toContain("list the exact files changed");
  expect(parsed.context).toContain("prompt-only or explain why it was not");
});

test("bare caret without source path tells the imp to identify its executable first", () => {
  const parsed = parseEvolutionPromptAction(" ^ ");
  expect(parsed.kind).toBe("evolve");
  if (parsed.kind !== "evolve") throw new Error("expected evolve action");
  expect(parsed.context).toContain("Target imp source path: unknown");
  expect(parsed.context).toContain("identify this imp's executable/source before editing");
});

test("caret with text parses as immediate evolve request", () => {
  const parsed = parseEvolutionPromptAction("^ fix gh rate-limit recovery");
  expect(parsed.kind).toBe("evolve");
  if (parsed.kind !== "evolve") throw new Error("expected evolve action");
  expect(parsed.brief).toBe("fix gh rate-limit recovery");
  expect(parsed.modelPrompt).toBe("fix gh rate-limit recovery");
  expect(parsed.context).toContain("fix gh rate-limit recovery");
});

test("plus feedback does not inject inline imp evolution instructions", () => {
  const parsed = parseEvolutionPromptAction("+missed rate limit handling\nlist prs");
  expect(parsed.kind).toBe("context");
  if (parsed.kind !== "context") throw new Error("expected context action");
  expect(parsed.context).toContain("leading + feedback line");
  expect(parsed.context).not.toContain("Imp Evolution instructions");
  expect(parsed.context).not.toContain("Evolve only this specific imp");
});

test("caret newline parses multiline immediate evolve brief", () => {
  const parsed = parseEvolutionPromptAction("^\nline one\nline two");
  expect(parsed.kind).toBe("evolve");
  if (parsed.kind !== "evolve") throw new Error("expected evolve action");
  expect(parsed.brief).toBe("line one\nline two");
});

test("caret inside normal text is not evolution control", () => {
  expect(parseEvolutionPromptAction("explain why ^ means xor")).toEqual({ kind: "none" });
});

test("caret without following whitespace is not evolution control", () => {
  expect(parseEvolutionPromptAction("^foo")).toEqual({ kind: "none" });
});

test("hook-owned user feedback creates one pending evolution suggestion", () => {
  expect(recordUserEvolutionSignal({
    imp: "imp-hook",
    originalPrompt: "+Use gh instead of broad search\nList my open PRs",
    modelPrompt: "List my open PRs",
    userFeedback: "Use gh instead of broad search",
    sessionId: "thread-hook",
    now: new Date("2026-06-18T12:00:00Z"),
  })).toBe(true);
  expect(recordUserEvolutionSignal({
    imp: "imp-hook",
    originalPrompt: "+Use gh instead of broad search\nList my open PRs",
    modelPrompt: "List my open PRs",
    userFeedback: "Use gh instead of broad search",
    sessionId: "thread-hook",
    now: new Date("2026-06-18T12:01:00Z"),
  })).toBe(false);
  const suggestions = readEvolutionSuggestions("imp-hook");
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].state).toBe("pending");
  expect(suggestions[0].severity).toBe("medium");
  expect(suggestions[0].transport).toBeUndefined();
  expect(suggestions[0].evidence.join("\n")).toContain("user marked this turn for evolution");
  expect(suggestions[0].evidence.join("\n")).not.toContain("session produced no final assistant text");
  const sessionBody = readFileSync(suggestions[0].event_log_path!, "utf8");
  expect(sessionBody).toContain('"transport":"hook:user-prompt-submit"');
  expect(sessionBody).not.toContain("session produced no final assistant text");
});

test("hook-owned user feedback redacts persisted secrets", () => {
  expect(recordUserEvolutionSignal({
    imp: "imp-hook-redact",
    originalPrompt: "+token=ghp_abcdefghijklmnopqrstuvwxyz123456\nDo work",
    modelPrompt: "Do work",
    userFeedback: "token=ghp_abcdefghijklmnopqrstuvwxyz123456",
    now: new Date("2026-06-18T12:00:00Z"),
  })).toBe(true);
  const suggestion = readEvolutionSuggestions("imp-hook-redact")[0];
  expect(JSON.stringify(suggestion)).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
  const body = readFileSync(suggestion.event_log_path!, "utf8");
  expect(body).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
});

test("hook-owned caret request preserves an explicit empty model prompt", () => {
  expect(recordUserEvolutionSignal({
    imp: "imp-caret",
    originalPrompt: "^",
    modelPrompt: "",
    userFeedback: "User requested immediate imp evolution for the current conversation.",
    userSignal: "review_requested",
    sessionId: "thread-caret",
    turnId: "turn-caret",
    transcriptPath: "/tmp/transcript.jsonl",
    dedupeScope: "thread-caret",
    now: new Date("2026-06-18T12:00:00Z"),
  })).toBe(true);
  const suggestion = readEvolutionSuggestions("imp-caret")[0];
  expect(suggestion.state).toBe("pending");
  expect(suggestion.thread_id).toBe("thread-caret");
  expect(suggestion.turn_id).toBe("turn-caret");
  expect(suggestion.transcript_path).toBe("/tmp/transcript.jsonl");
  expect(suggestion.evidence.join("\n")).toContain("requested imp evolution review");
  const body = readFileSync(suggestion.event_log_path!, "utf8");
  expect(body).toContain('"prompt":""');
  expect(body).toContain('"originalPrompt":"^"');
  expect(body).toContain('"userSignal":"review_requested"');
});

test("explicit user signal still creates a pending suggestion when supplied by telemetry", () => {
  const suggestion = makeEvolutionSuggestion({
    imp: "imp-test",
    prompt: "Please add 4 more bullet points",
    finalText: "done",
    status: "completed",
    transport: "test",
    userSignal: "disappointed",
    userFeedback: "This should know about github.com/johnlindquist/fusion",
    now: new Date("2026-06-18T12:00:00Z"),
  });
  expect(suggestion).not.toBeNull();
  expect(suggestion!.state).toBe("pending");
  expect(suggestion!.severity).toBe("medium");
  expect(suggestion!.recommendation).toContain("Review this session");
  expect(suggestion!.evidence.join("\n")).toContain("user marked this run for evolution");
});

test("dedupes pending suggestions by stable key", () => {
  const a = makeEvolutionSuggestion({
    imp: "imp-dupe",
    prompt: "same prompt",
    finalText: "",
    status: "completed",
    transport: "test",
    now: new Date("2026-06-18T12:00:00Z"),
  })!;
  const b = makeEvolutionSuggestion({
    imp: "imp-dupe",
    prompt: "same prompt",
    finalText: "",
    status: "completed",
    transport: "test",
    now: new Date("2026-06-18T12:01:00Z"),
  })!;
  expect(a.dedupe_key).toBe(b.dedupe_key);
  expect(appendEvolutionSuggestion(a)).toBe(true);
  expect(appendEvolutionSuggestion(b)).toBe(false);
  expect(readEvolutionSuggestions("imp-dupe").length).toBe(1);
});

test("redacts common secrets before persistence", () => {
  expect(redactSecrets("Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz123456")).toContain("[REDACTED]");
  const telemetry: EvolutionTelemetry = {
    imp: "imp-redact",
    prompt: "token=ghp_abcdefghijklmnopqrstuvwxyz123456",
    originalPrompt: "+token=ghp_abcdefghijklmnopqrstuvwxyz123456\nreal prompt",
    userSignal: "disappointed",
    userFeedback: "token=ghp_abcdefghijklmnopqrstuvwxyz123456",
    finalText: "AWS_SECRET_ACCESS_KEY=abcdef",
    threadId: "thread-redact",
    transport: "test",
    status: "completed",
    startedAt: "2026-06-18T12:00:00Z",
    completedAt: "2026-06-18T12:00:01Z",
    events: [{ headers: { Authorization: "Bearer sk-abcdefghijklmnopqrstuvwxyz123456" } }],
  };
  const file = writeSessionLog(telemetry);
  const body = readFileSync(file, "utf8");
  expect(body).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
  expect(body).not.toContain("AWS_SECRET_ACCESS_KEY=abcdef");
  expect(body).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
});

test("clean telemetry records a stabilization summary", () => {
  const telemetry: EvolutionTelemetry = {
    imp: "imp-stable",
    prompt: "say hi",
    finalText: "hi",
    threadId: "thread-stable",
    turnId: "turn-stable",
    transport: "test",
    status: "completed",
    startedAt: "2026-06-18T12:00:00Z",
    completedAt: "2026-06-18T12:00:01Z",
    events: [],
  };
  const file = writeSessionLog(telemetry);
  const result = evaluateTelemetry(telemetry, file, new Date("2026-06-18T12:00:02Z"));
  expect("summary" in result).toBe(true);
  expect(appendStabilization(result as any)).toBe(true);
  expect(readStabilizations("imp-stable").length).toBe(1);
  expect(evolutionStatusLine("imp-stable")).toBeUndefined();
});

test("enqueueEvolutionJob writes a durable queue file", () => {
  const job = enqueueEvolutionJob("imp-queue", "/tmp/session.jsonl", new Date("2026-06-18T12:00:00Z"));
  expect(job.id).toStartWith("job_");
  expect(readFileSync(join(root, "evolution-queue", `${job.id}.json`), "utf8")).toContain("/tmp/session.jsonl");
});

test("three pending suggestions create an automatic evolution trigger", () => {
  for (let i = 0; i < 3; i++) {
    const suggestion = makeEvolutionSuggestion({
      imp: "imp-threshold",
      prompt: `prompt ${i}`,
      finalText: "",
      status: "completed",
      transport: "test",
      now: new Date(`2026-06-18T12:0${i}:00Z`),
    })!;
    expect(appendEvolutionSuggestion(suggestion)).toBe(true);
  }

  const trigger = refreshEvolutionTrigger("imp-threshold");
  expect(trigger?.pending).toBe(3);
  expect(trigger?.command).toBe("imp evolve imp-threshold");
  expect(readEvolutionTrigger("imp-threshold")?.reason).toContain("automatic threshold");
  expect(readFileSync(evolutionTriggerPath("imp-threshold"), "utf8")).toContain("imp evolve imp-threshold");
  expect(evolutionStatusLine("imp-threshold")).toContain("evolution review ready");
});

test("reviewed suggestions stop counting as pending", () => {
  const first = makeEvolutionSuggestion({
    imp: "imp-review",
    prompt: "first",
    finalText: "",
    status: "completed",
    transport: "test",
    now: new Date("2026-06-18T12:00:00Z"),
  })!;
  const second = makeEvolutionSuggestion({
    imp: "imp-review",
    prompt: "second",
    finalText: "",
    status: "completed",
    transport: "test",
    now: new Date("2026-06-18T12:01:00Z"),
  })!;
  appendEvolutionSuggestion(first);
  appendEvolutionSuggestion(second);

  expect(updateEvolutionSuggestionState("imp-review", [first.id], "applied")).toBe(1);
  expect(updateEvolutionSuggestionState("imp-review", ["all"], "dismissed")).toBe(1);
  expect(pendingEvolutionCount("imp-review")).toBe(0);
  expect(readEvolutionSuggestions("imp-review").map((s) => s.state)).toEqual(["applied", "dismissed"]);
});

test("suggestions are written under IMP_HOME", () => {
  const file = evolutionFilePath("imp-test");
  expect(file.startsWith(root)).toBe(true);
});
