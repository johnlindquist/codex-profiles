import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { appendEvolutionSuggestion, makeEvolutionSuggestion, readEvolutionSuggestions } from "../lib/evolution.ts";
import {
  acceptProposal,
  parseProposalFile,
  parseProposalResponse,
  proposalFilePath,
  readProposalRecord,
  renderProposalFile,
  writeProposalFile,
  type ProposalRecord,
} from "../lib/evolution-propose.ts";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
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

// Sets IMP_HOME for the rest of the test (restored in afterEach). Needed for
// async flows where a sync try/finally would restore the env before the promise
// settles.
function useImpHome(root: string): void {
  const old = process.env.IMP_HOME;
  process.env.IMP_HOME = root;
  cleanups.push(() => {
    if (old === undefined) delete process.env.IMP_HOME;
    else process.env.IMP_HOME = old;
  });
}

function git(args: string[], cwd: string, input?: string) {
  return spawnSync("git", args, { cwd, input, encoding: "utf8" });
}

// A scratch git repo with a committed fake imp, plus a git-apply-ready diff that
// rewrites its one line. Returns the diff, source path, and repo root.
function scratchRepoWithDiff(): { repoRoot: string; sourcePath: string; diff: string } {
  const repoRoot = tempDir("imp-propose-repo-");
  git(["init", "-q"], repoRoot);
  git(["config", "user.email", "t@example.com"], repoRoot);
  git(["config", "user.name", "Test"], repoRoot);
  const rel = "imps/imp-fake";
  mkdirSync(join(repoRoot, "imps"), { recursive: true });
  const sourcePath = join(repoRoot, rel);
  writeFileSync(sourcePath, "answer from memory\n");
  git(["add", "."], repoRoot);
  git(["commit", "-qm", "seed"], repoRoot);

  writeFileSync(sourcePath, "run jq first\n");
  const diff = git(["diff"], repoRoot).stdout;
  git(["checkout", "--", "."], repoRoot);
  return { repoRoot, sourcePath, diff };
}

const MODEL_RESPONSE = `Here is the proposal.

## RATIONALE
The imp answered from memory instead of running jq first, so a rule was added to force a jq call. This addresses the pending suggestion directly.

## DIFF
\`\`\`diff
diff --git a/imps/imp-fake b/imps/imp-fake
index 1111111..2222222 100755
--- a/imps/imp-fake
+++ b/imps/imp-fake
@@ -1 +1 @@
-answer from memory
+run jq first
\`\`\`

## EVAL_CASE
\`\`\`ts
{ name: "runs jq before answering", prompt: "count users", check: ({ stdout }) => (stdout.includes("jq") ? null : "no jq") }
\`\`\`
`;

test("parseProposalResponse extracts rationale, diff, and eval case", () => {
  const result = parseProposalResponse(MODEL_RESPONSE);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.proposal.rationale).toContain("answered from memory");
  expect(result.proposal.diff).toContain("diff --git a/imps/imp-fake");
  expect(result.proposal.diff.endsWith("\n")).toBe(true);
  expect(result.proposal.evalCase).toContain("runs jq before answering");
});

test("parseProposalResponse treats NONE eval case as absent", () => {
  const raw = MODEL_RESPONSE.replace(
    /## EVAL_CASE[\s\S]*$/,
    "## EVAL_CASE\n```ts\nNONE\n```\n",
  );
  const result = parseProposalResponse(raw);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.proposal.evalCase).toBeUndefined();
});

test("parseProposalResponse fails when there is no diff block", () => {
  const result = parseProposalResponse("## RATIONALE\nJust some prose, no diff.\n");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.reason).toContain("no unified diff");
});

test("proposal file write/read round-trips through IMP_HOME", () => {
  const home = tempDir("imp-propose-home-");
  const record: ProposalRecord = {
    schema: 1,
    imp: "imp-fake",
    id: "evo_roundtrip",
    sourcePath: "/repo/imps/imp-fake",
    repoRoot: "/repo",
    evalSuitePath: "/repo/evals/imp-fake.ts",
    createdAt: "2026-07-01T00:00:00.000Z",
    status: "proposed",
    rationale: "Force a jq call.",
    diff: "diff --git a/imps/imp-fake b/imps/imp-fake\n@@ -1 +1 @@\n-a\n+b\n",
    evalCase: '{ name: "x", prompt: "y", check: () => null }',
  };

  const { file, read } = withImpHome(home, () => {
    const file = writeProposalFile(record);
    return { file, read: readProposalRecord("imp-fake", "evo_roundtrip") };
  });

  expect(file).toBe(join(home, "imp-fake", "proposals", "evo_roundtrip.md"));
  expect(read).toBeDefined();
  expect(read!.status).toBe("proposed");
  expect(read!.rationale).toBe("Force a jq call.");
  expect(read!.diff).toBe(record.diff);
  expect(read!.evalCase).toBe(record.evalCase);
  expect(read!.repoRoot).toBe("/repo");
  expect(read!.evalSuitePath).toBe("/repo/evals/imp-fake.ts");
});

test("failed proposal round-trips and preserves raw output", () => {
  const record: ProposalRecord = {
    schema: 1,
    imp: "imp-fake",
    id: "evo_failed",
    sourcePath: "/repo/imps/imp-fake",
    repoRoot: "/repo",
    createdAt: "2026-07-01T00:00:00.000Z",
    status: "failed",
    raw: "the model rambled without a diff",
  };
  const parsed = parseProposalFile(renderProposalFile(record));
  expect(parsed.status).toBe("failed");
  expect(parsed.raw).toContain("the model rambled without a diff");
  expect(parsed.diff).toBeUndefined();
});

function seedSuggestion(home: string, imp: string): string {
  return withImpHome(home, () => {
    const suggestion = makeEvolutionSuggestion({
      imp,
      prompt: "seed",
      finalText: "",
      status: "completed",
      transport: "test",
      now: new Date("2026-06-01T00:00:00Z"),
    });
    if (!suggestion) throw new Error("expected suggestion");
    appendEvolutionSuggestion(suggestion);
    return suggestion.id;
  });
}

function suggestionState(home: string, imp: string, id: string): string | undefined {
  return withImpHome(home, () => readEvolutionSuggestions(imp).find((s) => s.id === id)?.state);
}

test("acceptProposal applies the diff, evals pass, and marks the suggestion applied", async () => {
  const home = tempDir("imp-propose-home-");
  const { repoRoot, sourcePath, diff } = scratchRepoWithDiff();
  const id = seedSuggestion(home, "imp-fake");
  const suiteFile = join(tempDir("imp-propose-suite-"), "imp-fake.ts");
  writeFileSync(suiteFile, "export default [];\n");

  const record: ProposalRecord = {
    schema: 1,
    imp: "imp-fake",
    id,
    sourcePath,
    repoRoot,
    evalSuitePath: suiteFile,
    createdAt: new Date().toISOString(),
    status: "proposed",
    rationale: "force jq",
    diff,
  };

  useImpHome(home);
  const outcome = await acceptProposal(record, { evalsRunner: async () => ({ code: 0 }) });

  expect(outcome.ok).toBe(true);
  if (outcome.ok) expect(outcome.proven).toBe(true);
  expect(readFileSync(sourcePath, "utf8")).toBe("run jq first\n");
  expect(suggestionState(home, "imp-fake", id)).toBe("applied");
});

test("acceptProposal reverts the diff and leaves the suggestion pending when evals fail", async () => {
  const home = tempDir("imp-propose-home-");
  const { repoRoot, sourcePath, diff } = scratchRepoWithDiff();
  const id = seedSuggestion(home, "imp-fake");
  const suiteFile = join(tempDir("imp-propose-suite-"), "imp-fake.ts");
  writeFileSync(suiteFile, "export default [];\n");

  const record: ProposalRecord = {
    schema: 1,
    imp: "imp-fake",
    id,
    sourcePath,
    repoRoot,
    evalSuitePath: suiteFile,
    createdAt: new Date().toISOString(),
    status: "proposed",
    diff,
  };

  let ran = false;
  useImpHome(home);
  const outcome = await acceptProposal(record, {
    evalsRunner: async () => {
      ran = true;
      return { code: 1 };
    },
  });

  expect(ran).toBe(true);
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) {
    expect(outcome.stage).toBe("evals");
    expect(outcome.reverted).toBe(true);
  }
  expect(readFileSync(sourcePath, "utf8")).toBe("answer from memory\n");
  expect(suggestionState(home, "imp-fake", id)).toBe("pending");
});

test("acceptProposal ships unproven and applies when the imp has no eval suite", async () => {
  const home = tempDir("imp-propose-home-");
  const { repoRoot, sourcePath, diff } = scratchRepoWithDiff();
  const id = seedSuggestion(home, "imp-fake");

  const record: ProposalRecord = {
    schema: 1,
    imp: "imp-fake",
    id,
    sourcePath,
    repoRoot,
    createdAt: new Date().toISOString(),
    status: "proposed",
    diff,
  };

  let ran = false;
  useImpHome(home);
  const outcome = await acceptProposal(record, {
    evalsRunner: async () => {
      ran = true;
      return { code: 0 };
    },
  });

  expect(ran).toBe(false); // no suite -> no paid eval run
  expect(outcome.ok).toBe(true);
  if (outcome.ok) expect(outcome.proven).toBe(false);
  expect(readFileSync(sourcePath, "utf8")).toBe("run jq first\n");
  expect(suggestionState(home, "imp-fake", id)).toBe("applied");
});

test("acceptProposal fails at apply-check for a non-applyable diff", async () => {
  const home = tempDir("imp-propose-home-");
  const { repoRoot, sourcePath } = scratchRepoWithDiff();

  const record: ProposalRecord = {
    schema: 1,
    imp: "imp-fake",
    id: "evo_bad",
    sourcePath,
    repoRoot,
    createdAt: new Date().toISOString(),
    status: "proposed",
    diff: "diff --git a/does-not-exist b/does-not-exist\n--- a/does-not-exist\n+++ b/does-not-exist\n@@ -1 +1 @@\n-x\n+y\n",
  };

  useImpHome(home);
  const outcome = await acceptProposal(record, { evalsRunner: async () => ({ code: 0 }) });
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.stage).toBe("apply-check");
});
