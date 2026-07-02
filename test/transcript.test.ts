import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  createTranscriptRecorder,
  formatDuration,
  formatStatsLine,
  formatTokens,
  transcriptFilePath,
  writeTranscriptEntry,
  type TranscriptEntry,
} from "../lib/transcript.ts";

const root = mkdtempSync(join(tmpdir(), "transcript-"));
const oldImpHome = process.env.IMP_HOME;
const oldNoTranscript = process.env.IMP_NO_TRANSCRIPT;

function restore(key: string, prev: string | undefined) {
  if (prev === undefined) delete process.env[key];
  else process.env[key] = prev;
}

beforeEach(() => {
  process.env.IMP_HOME = root;
  delete process.env.IMP_NO_TRANSCRIPT;
});

afterEach(() => {
  delete process.env.IMP_NO_TRANSCRIPT;
});

afterAll(() => {
  restore("IMP_HOME", oldImpHome);
  restore("IMP_NO_TRANSCRIPT", oldNoTranscript);
  rmSync(root, { recursive: true, force: true });
});

function entry(over: Partial<TranscriptEntry> = {}): TranscriptEntry {
  return {
    ts: "2026-07-01T12:00:00.000Z",
    imp: "imp-test",
    cwd: "/work",
    prompt: "count the users",
    transport: "warm",
    model: "gpt-x",
    durationMs: 3200,
    status: "completed",
    commands: [{ command: "ls", exitCode: 0 }],
    tokens: 5800,
    answerChars: 42,
    ...over,
  };
}

function readLines(file: string): any[] {
  return readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
}

test("appends valid JSONL, one object per line", () => {
  const imp = "imp-append";
  const file = transcriptFilePath(imp, "2026-07-01T00:00:00.000Z");
  writeTranscriptEntry(entry({ imp, answerChars: 1 }));
  writeTranscriptEntry(entry({ imp, answerChars: 2 }));

  const rows = readLines(file);
  expect(rows).toHaveLength(2);
  expect(rows[0].imp).toBe(imp);
  expect(rows[0].transport).toBe("warm");
  expect(rows[0].commands).toEqual([{ command: "ls", exitCode: 0 }]);
  expect(rows[0].tokens).toBe(5800);
  expect(rows[0].answerChars).toBe(1);
  expect(rows[1].answerChars).toBe(2);
});

test("truncates prompt to 2000 chars", () => {
  const imp = "imp-truncate";
  const long = "x".repeat(5000);
  writeTranscriptEntry(entry({ imp, prompt: long }));
  const rows = readLines(transcriptFilePath(imp, "2026-07-01T00:00:00.000Z"));
  expect(rows[0].prompt).toHaveLength(2000);
});

test("keeps short prompts intact", () => {
  const imp = "imp-short";
  writeTranscriptEntry(entry({ imp, prompt: "hi" }));
  const rows = readLines(transcriptFilePath(imp, "2026-07-01T00:00:00.000Z"));
  expect(rows[0].prompt).toBe("hi");
});

test("honors IMP_NO_TRANSCRIPT=1 (writes nothing)", () => {
  const imp = "imp-optout";
  process.env.IMP_NO_TRANSCRIPT = "1";
  writeTranscriptEntry(entry({ imp }));
  expect(existsSync(transcriptFilePath(imp, "2026-07-01T00:00:00.000Z"))).toBe(false);
});

test("filename is month-based from the entry ts", () => {
  expect(transcriptFilePath("imp-x", "2026-07-01T23:00:00.000Z")).toBe(
    join(root, "imp-x", "transcripts", "2026-07.jsonl"),
  );
  expect(transcriptFilePath("imp-x", "2025-12-31T23:00:00.000Z")).toBe(
    join(root, "imp-x", "transcripts", "2025-12.jsonl"),
  );

  const imp = "imp-months";
  writeTranscriptEntry(entry({ imp, ts: "2026-07-15T00:00:00.000Z" }));
  writeTranscriptEntry(entry({ imp, ts: "2026-08-02T00:00:00.000Z" }));
  expect(existsSync(join(root, imp, "transcripts", "2026-07.jsonl"))).toBe(true);
  expect(existsSync(join(root, imp, "transcripts", "2026-08.jsonl"))).toBe(true);
});

test("omits tokens key when undefined", () => {
  const imp = "imp-notokens";
  writeTranscriptEntry(entry({ imp, tokens: undefined }));
  const rows = readLines(transcriptFilePath(imp, "2026-07-01T00:00:00.000Z"));
  expect("tokens" in rows[0]).toBe(false);
});

test("tolerates an unwritable IMP_HOME without throwing", () => {
  // Point IMP_HOME at a path *under a regular file* so mkdir fails with ENOTDIR.
  const blocker = join(root, "not-a-dir");
  writeFileSync(blocker, "x");
  process.env.IMP_HOME = join(blocker, "nested");
  expect(() => writeTranscriptEntry(entry({ imp: "imp-boom" }))).not.toThrow();
});

test("formatTokens: k-scaling and singular", () => {
  expect(formatTokens(5800)).toBe("5.8k tokens");
  expect(formatTokens(1000)).toBe("1.0k tokens");
  expect(formatTokens(999)).toBe("999 tokens");
  expect(formatTokens(12)).toBe("12 tokens");
  expect(formatTokens(1)).toBe("1 token");
  expect(formatTokens(0)).toBe("0 tokens");
});

test("formatDuration: sub-minute seconds and minute rollover", () => {
  expect(formatDuration(3200)).toBe("3.2s");
  expect(formatDuration(800)).toBe("0.8s");
  expect(formatDuration(59_400)).toBe("59.4s");
  expect(formatDuration(83_000)).toBe("1m23s");
});

test("formatStatsLine: warm/cold collapse and optional tokens", () => {
  expect(formatStatsLine({ imp: "imp-git", transport: "warm", durationMs: 3200, tokens: 5800 })).toBe(
    "⚡ imp-git · warm · 3.2s · 5.8k tokens",
  );
  expect(formatStatsLine({ imp: "imp-git", transport: "sdk-stream", durationMs: 1000 })).toBe(
    "⚡ imp-git · cold · 1.0s",
  );
  expect(formatStatsLine({ imp: "imp-git", transport: "sdk-quiet", durationMs: 1000, tokens: 0 })).toBe(
    "⚡ imp-git · cold · 1.0s",
  );
});

test("recorder collects commands + tokens + answer from SDK events", () => {
  const imp = "imp-sdk";
  const rec = createTranscriptRecorder(imp, { cwd: "/w", prompt: "do it", model: "m" });
  rec.onSdkEvent({ type: "item.completed", item: { id: "c1", type: "command_execution", command: "grep foo", exit_code: 2 } });
  rec.onSdkEvent({ type: "item.completed", item: { id: "a1", type: "agent_message", text: "hello world" } });
  rec.onSdkEvent({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 40, reasoning_output_tokens: 5 } });
  const e = rec.finish({ status: "completed", transport: "sdk-stream" });

  expect(e.commands).toEqual([{ command: "grep foo", exitCode: 2 }]);
  expect(e.tokens).toBe(140);
  expect(e.answerChars).toBe("hello world".length);
  expect(e.transport).toBe("sdk-stream");

  const rows = readLines(transcriptFilePath(imp, e.ts));
  expect(rows[0].commands[0].exitCode).toBe(2);
});

test("recorder collects from warm app-server notifications (started+completed)", () => {
  const imp = "imp-warm";
  const rec = createTranscriptRecorder(imp, { cwd: "/w", prompt: "do it" });
  rec.onAppServerNotification("item/started", { item: { id: "c1", type: "commandExecution", command: "npm test" } });
  rec.onAppServerNotification("item/agentMessage/delta", { delta: "par" });
  rec.onAppServerNotification("item/agentMessage/delta", { delta: "tial" });
  rec.onAppServerNotification("item/completed", { item: { id: "c1", type: "commandExecution", command: "npm test", exitCode: 1 } });
  rec.onAppServerNotification("thread/tokenUsage/updated", { tokenUsage: { total: { totalTokens: 2500 }, last: { totalTokens: 2500 } } });
  const e = rec.finish({ status: "completed", transport: "warm" });

  expect(e.commands).toEqual([{ command: "npm test", exitCode: 1 }]);
  expect(e.tokens).toBe(2500);
  expect(e.answerChars).toBe("partial".length);
});

test("recorder finish is idempotent (single line, stable entry)", () => {
  const imp = "imp-idem";
  const rec = createTranscriptRecorder(imp, { cwd: "/w", prompt: "p" });
  const first = rec.finish({ status: "completed", transport: "warm" });
  const second = rec.finish({ status: "interrupted", transport: "sdk-stream" });
  expect(second).toBe(first);
  expect(second.status).toBe("completed");
  const rows = readLines(transcriptFilePath(imp, first.ts));
  expect(rows).toHaveLength(1);
});

test("recorder honors finalText override for answerChars (quiet path)", () => {
  const rec = createTranscriptRecorder("imp-final", { cwd: "/w", prompt: "p" });
  const e = rec.finish({ status: "completed", transport: "sdk-quiet", finalText: "buffered answer", tokens: 77 });
  expect(e.answerChars).toBe("buffered answer".length);
  expect(e.tokens).toBe(77);
});
