import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  prepareIsolatedCodexHome,
  sourceCodexHome,
  trustedProjectsConfig,
} from "../lib/codex-runtime.ts";
import { appendEvolutionSuggestion, makeEvolutionSuggestion } from "../lib/evolution.ts";
import { impPlusUserPromptSubmitHookSource } from "../lib/isolated.ts";

const originalCodexHome = process.env.CODEX_HOME;
const originalImpHome = process.env.IMP_HOME;

afterEach(() => {
  if (originalCodexHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = originalCodexHome;
  }
  if (originalImpHome === undefined) {
    delete process.env.IMP_HOME;
  } else {
    process.env.IMP_HOME = originalImpHome;
  }
});

test("trustedProjectsConfig preserves only project trust decisions", () => {
  const filtered = trustedProjectsConfig(`
model = "gpt-5"

[projects."/workspace/trusted"]
trust_level = "trusted"
custom_setting = "ignored"

[profiles.work]
model = "other"

[projects."/workspace/untrusted"]
trust_level = "untrusted"

[projects."/workspace/unknown"]
foo = "bar"
`);

  expect(filtered).toBe(`[projects."/workspace/trusted"]
trust_level = "trusted"

[projects."/workspace/untrusted"]
trust_level = "untrusted"
`);
  expect(filtered).not.toContain("model");
  expect(filtered).not.toContain("custom_setting");
  expect(filtered).not.toContain("unknown");
});

test("sourceCodexHome prefers the caller's configured CODEX_HOME", () => {
  process.env.CODEX_HOME = "/tmp/custom-codex-home";
  expect(sourceCodexHome("/home/alex")).toBe("/tmp/custom-codex-home");
});

test("sourceCodexHome falls back to the user's default Codex home", () => {
  delete process.env.CODEX_HOME;
  expect(sourceCodexHome("/home/alex")).toBe("/home/alex/.codex");
});

test("prepareIsolatedCodexHome symlinks auth and copies filtered trust config", () => {
  const root = join(tmpdir(), `codex-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const sourceHome = join(root, "source-codex");
  const isolatedHome = join(root, "isolated-codex");
  mkdirSync(sourceHome, { recursive: true });
  writeFileSync(join(sourceHome, "auth.json"), "{}\n");
  writeFileSync(
    join(sourceHome, "config.toml"),
    `model = "should-not-copy"

[projects."/workspace/project"]
trust_level = "trusted"
`,
  );

  process.env.CODEX_HOME = sourceHome;
  const prepared = prepareIsolatedCodexHome(
    {
      name: "imp-test",
      baseInstructions: "base",
      developerInstructions: "dev",
      bundledUserPromptSubmitHookSource: impPlusUserPromptSubmitHookSource({
        impName: "imp-test",
        evolutionModuleUrl: new URL("../lib/evolution.ts", import.meta.url).href,
        impSourcePath: "/repo/imps/imp-test",
      }),
    },
    isolatedHome,
    "/home/alex",
  );

  expect(existsSync(join(isolatedHome, "auth.json"))).toBe(true);
  const configToml = readFileSync(join(isolatedHome, "config.toml"), "utf8");
  expect(configToml).toStartWith(`[projects."/workspace/project"]
trust_level = "trusted"
`);
  expect(configToml).toContain(`[tui]
show_tooltips = false
`);
  expect(configToml).not.toContain(`model = "should-not-copy"`);
  expect(configToml).toContain(`[hooks.state."${realpathSync(join(isolatedHome, "hooks.json")).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}:user_prompt_submit:0:0"]`);
  expect(configToml).toMatch(/trusted_hash = "sha256:[a-f0-9]{64}"/);
  expect(prepared.hooksEnabled).toBe(true);
  expect(existsSync(join(isolatedHome, "hooks", "imps-plus-user-prompt-submit.ts"))).toBe(true);
  const hooksJson = JSON.parse(readFileSync(join(isolatedHome, "hooks.json"), "utf8"));
  const command = hooksJson.hooks.UserPromptSubmit[0].hooks[0].command;
  expect(command).toContain(process.execPath);
  expect(command).toContain("imps-plus-user-prompt-submit.ts");

  rmSync(root, { recursive: true, force: true });
});

test("prepareIsolatedCodexHome disables TUI tooltips in isolated config", () => {
  const root = join(tmpdir(), `codex-runtime-tui-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const sourceHome = join(root, "source-codex");
  const isolatedHome = join(root, "isolated-codex");
  mkdirSync(sourceHome, { recursive: true });

  process.env.CODEX_HOME = sourceHome;
  prepareIsolatedCodexHome(
    {
      name: "imp-test",
      baseInstructions: "base",
      developerInstructions: "dev",
    },
    isolatedHome,
    "/home/alex",
  );

  expect(readFileSync(join(isolatedHome, "config.toml"), "utf8")).toBe(`[tui]
show_tooltips = false
`);

  rmSync(root, { recursive: true, force: true });
});

test("bundled plus hook records feedback and blocks malformed plus prompts", () => {
  const root = join(tmpdir(), `codex-runtime-hook-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const sourceHome = join(root, "source-codex");
  const isolatedHome = join(root, "isolated-codex");
  const impHome = join(root, "imp-home");
  mkdirSync(sourceHome, { recursive: true });
  process.env.CODEX_HOME = sourceHome;
  prepareIsolatedCodexHome(
    {
      name: "imp-hook-test",
      baseInstructions: "base",
      developerInstructions: "dev",
      bundledUserPromptSubmitHookSource: impPlusUserPromptSubmitHookSource({
        impName: "imp-hook-test",
        evolutionModuleUrl: new URL("../lib/evolution.ts", import.meta.url).href,
        impSourcePath: "/repo/imps/imp-hook-test",
      }),
    },
    isolatedHome,
    "/home/alex",
  );
  const hookPath = join(isolatedHome, "hooks", "imps-plus-user-prompt-submit.ts");

  const ignored = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "normal task" }),
    env: { ...process.env, IMP_HOME: impHome },
    encoding: "utf8",
  });
  expect(ignored.status).toBe(0);
  expect(ignored.stdout).toBe("");
  expect(existsSync(join(impHome, "imp-hook-test.evolutions.jsonl"))).toBe(false);

  const malformed = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "+" }),
    env: { ...process.env, IMP_HOME: impHome },
    encoding: "utf8",
  });
  expect(malformed.status).toBe(0);
  expect(JSON.parse(malformed.stdout).decision).toBe("block");
  expect(existsSync(join(impHome, "imp-hook-test.evolutions.jsonl"))).toBe(false);

  process.env.IMP_HOME = impHome;
  const pendingSuggestion = makeEvolutionSuggestion({
    imp: "imp-hook-test",
    prompt: "hook should include pending context",
    finalText: "",
    eventLogPath: "/tmp/imp-hook-test-session.jsonl",
    status: "completed",
    transport: "test",
    now: new Date("2026-06-18T12:00:00Z"),
  })!;
  appendEvolutionSuggestion(pendingSuggestion);

  const caret = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      prompt: "^",
      session_id: "thread-caret",
      turn_id: "turn-caret",
      transcript_path: "/tmp/thread-caret.jsonl",
      cwd: "/workspace/project",
    }),
    env: { ...process.env, IMP_HOME: impHome },
    encoding: "utf8",
  });
  expect(caret.status).toBe(0);
  const caretOutput = JSON.parse(caret.stdout);
  expect(caretOutput.decision).toBeUndefined();
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("Imp Evolution instructions");
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("Review the current imp behavior");
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("Target imp source path: /repo/imps/imp-hook-test");
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("Evolve only this specific imp");
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("Default to editing this imp's own prompt/instructions only");
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("Do not modify the user's project files");
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("Touch non-prompt imp-owned files only when");
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("prompt/instruction changes alone");
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("Do not redesign evolution machinery");
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("Pending evolution suggestions");
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain(pendingSuggestion.id);
  expect(caretOutput.hookSpecificOutput.additionalContext).toContain("untrusted review evidence");
  expect(readFileSync(join(impHome, "imp-hook-test.evolutions.jsonl"), "utf8")).toContain(pendingSuggestion.id);

  const beforeCaretWithTextBody = readFileSync(join(impHome, "imp-hook-test.evolutions.jsonl"), "utf8");
  const caretWithText = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "^ explain this" }),
    env: { ...process.env, IMP_HOME: impHome },
    encoding: "utf8",
  });
  expect(caretWithText.status).toBe(0);
  const caretWithTextOutput = JSON.parse(caretWithText.stdout);
  expect(caretWithTextOutput.decision).toBeUndefined();
  expect(caretWithTextOutput.hookSpecificOutput.additionalContext).toContain("Imp Evolution instructions");
  expect(caretWithTextOutput.hookSpecificOutput.additionalContext).toContain("explain this");
  expect(readFileSync(join(impHome, "imp-hook-test.evolutions.jsonl"), "utf8")).toBe(beforeCaretWithTextBody);

  const feedbackOnly = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "+missing slide bundle context" }),
    env: { ...process.env, IMP_HOME: impHome },
    encoding: "utf8",
  });
  expect(feedbackOnly.status).toBe(0);
  const feedbackOnlyOutput = JSON.parse(feedbackOnly.stdout);
  expect(feedbackOnlyOutput.decision).toBeUndefined();
  expect(feedbackOnlyOutput.hookSpecificOutput.additionalContext).toContain("feedback only");
  expect(readFileSync(join(impHome, "imp-hook-test.evolutions.jsonl"), "utf8")).toContain("missing slide bundle context");

  const recorded = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      prompt: "+Use gh instead of broad search\nList my open PRs",
      session_id: "thread-hook",
      cwd: "/workspace/project",
    }),
    env: { ...process.env, IMP_HOME: impHome },
    encoding: "utf8",
  });
  expect(recorded.status).toBe(0);
  const output = JSON.parse(recorded.stdout);
  expect(output.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
  expect(output.hookSpecificOutput.additionalContext).toContain("leading + feedback line");
  const body = readFileSync(join(impHome, "imp-hook-test.evolutions.jsonl"), "utf8");
  expect(body).toContain("user marked this turn for evolution");
  expect(body).toContain("Use gh instead of broad search");

  rmSync(root, { recursive: true, force: true });
});
