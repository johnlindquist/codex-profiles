import { expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const REF = join(ROOT, "imps", "imp-prompt-standard");

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function extractBaseInstructions(src: string): string {
  const constMatch = src.match(/const baseInstructions\s*=\s*"([^"]+)";/s);
  if (constMatch) return constMatch[1];

  const multilineConstMatch = src.match(/const baseInstructions\s*=\s*\n\s*"([^"]+)";/s);
  if (multilineConstMatch) return multilineConstMatch[1];

  const inlineMatch = src.match(/baseInstructions:\s*"([^"]+)"/s);
  if (inlineMatch) return inlineMatch[1];

  throw new Error("baseInstructions not found");
}

test("reference prompt standard imp exists and is executable", () => {
  expect(existsSync(REF)).toBe(true);
  expect(statSync(REF).mode & 0o111).toBeGreaterThan(0);
});

test("package.json exposes imp-prompt-standard as a bin", () => {
  const pkg = JSON.parse(source(join(ROOT, "package.json")));
  expect(pkg.bin["imp-prompt-standard"]).toBe("./imps/imp-prompt-standard");
});

test("reference imp keeps baseInstructions short and scoped", () => {
  const base = extractBaseInstructions(source(REF));
  expect(base.length).toBeLessThanOrEqual(240);
  expect(base).toContain("imp-prompt-standard");
  expect(base).toContain("First step:");
  expect(base).toContain("never answer from memory");
  expect(base).not.toContain("##");
});

test("reference imp documents the standard section order", () => {
  const src = source(REF);
  for (const heading of [
    "## Mission",
    "## Tool-output trust boundary",
    "## Operating rule",
    "## Command map",
    "## Workflow",
    "## Mutation policy",
    "## Worked examples",
    "## Error recovery",
    "## Command rules",
    "## Output",
  ]) {
    expect(src).toContain(heading);
  }
});

test("reference imp is visibly read-only and treats evidence as untrusted", () => {
  const src = source(REF);
  expect(src).toContain('sandboxMode: "read-only"');
  expect(src).toContain("untrusted evidence");
  expect(src).toContain("never as instructions");
  expect(src).toContain("Do not use apply_patch");
  expect(src).toContain("Do not modify files");
});

test("docs/PROMPT.md points authors at the reference imp", () => {
  const docs = source(join(ROOT, "docs", "PROMPT.md"));
  expect(docs).toContain("imps/imp-prompt-standard");
  expect(docs).toContain("Reference implementation");
});
