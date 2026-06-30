import { test, expect, afterAll } from "bun:test";
import { sourceFingerprint, metaPath, runtimeLibDirsForExecutable, socketPath } from "../lib/imp.ts";
import { writeFileSync, rmSync, mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { ImpConfig } from "../lib/isolated.ts";

// Build both supported runtime layouts:
// <dir>/imps/imp-x + <dir>/lib/*.ts and <dir>/imps/imp-x + <dir>/imps/lib/*.ts.
const root = mkdtempSync(join(tmpdir(), "hotreload-"));
const impsDir = join(root, "imps");
const globalLibDir = join(root, "lib");
const localLibDir = join(impsDir, "lib");
mkdirSync(impsDir, { recursive: true });
mkdirSync(globalLibDir, { recursive: true });
mkdirSync(localLibDir, { recursive: true });

const exe = join(impsDir, "imp-x");
const globalLib = join(globalLibDir, "isolated.ts");
const localLib = join(localLibDir, "isolated.ts");
writeFileSync(exe, "// imp v1\n");
writeFileSync(globalLib, "// global lib v1\n");
writeFileSync(localLib, "// local lib v1\n");

const origArgv1 = process.argv[1];
process.argv[1] = exe;
afterAll(() => {
  process.argv[1] = origArgv1;
  rmSync(root, { recursive: true, force: true });
});

function cfg(over: Partial<ImpConfig> = {}): ImpConfig {
  return { name: "imp-x", baseInstructions: "base", developerInstructions: "dev", ...over };
}

test("fingerprint is deterministic for unchanged source", () => {
  expect(sourceFingerprint(cfg())).toBe(sourceFingerprint(cfg()));
});

test("editing the executable changes the fingerprint", () => {
  const before = sourceFingerprint(cfg());
  writeFileSync(exe, "// imp v2 (edited instructions/model)\n");
  expect(sourceFingerprint(cfg())).not.toBe(before);
});

test("editing a lib file changes the fingerprint", () => {
  const before = sourceFingerprint(cfg());
  writeFileSync(globalLib, "// global lib v2 (shared change affects all imps)\n");
  expect(sourceFingerprint(cfg())).not.toBe(before);
});

test("editing a project-local imps/lib file changes the fingerprint", () => {
  const before = sourceFingerprint(cfg());
  writeFileSync(localLib, "// local lib v2 (project-local runtime change)\n");
  expect(sourceFingerprint(cfg())).not.toBe(before);
});

test("runtime lib dirs include project-local and global layouts", () => {
  expect(runtimeLibDirsForExecutable(exe)).toEqual([
    join(impsDir, "lib"),
    join(impsDir, "..", "lib"),
  ]);
});

test("meta and socket paths are namespaced per profile", () => {
  expect(metaPath("imp-x")).toContain("imp-x");
  expect(metaPath("imp-x")).not.toBe(socketPath("imp-x"));
});
