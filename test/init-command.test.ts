import { afterEach, expect, test } from "bun:test";
import { spawn } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PROJECT_RUNTIME_FILES } from "../lib/init.ts";

const ROOT = join(import.meta.dir, "..");
const temps: string[] = [];

afterEach(() => {
  for (const temp of temps.splice(0)) {
    rmSync(temp, { recursive: true, force: true });
  }
});

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "imps-init-"));
  temps.push(dir);
  return dir;
}

function runImps(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["imps.ts", ...args], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code, signal) => resolve({ code: signal ? 130 : code ?? 0, stdout, stderr }));
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
  });
}

test("imps init creates a project-local runtime", async () => {
  const tmp = tempProject();
  const result = await runImps(["init", "--dir", tmp, "--no-install", "--json"]);
  expect(result.code).toBe(0);
  const json = JSON.parse(result.stdout);
  expect(json.ok).toBe(true);
  expect(json.layout).toBe("imps-local-lib");
  expect(json.agentImport).toBe("./lib/isolated.ts");
  expect(json.installed).toBe(false);

  for (const file of PROJECT_RUNTIME_FILES) {
    expect(existsSync(join(tmp, "imps", "lib", file))).toBe(true);
  }
  expect(existsSync(join(tmp, "imps", "package.json"))).toBe(true);
  expect(existsSync(join(tmp, "imps", ".gitignore"))).toBe(true);
  expect(existsSync(join(tmp, "imps", "imps.manifest.json"))).toBe(true);

  const packageJson = JSON.parse(readFileSync(join(tmp, "imps", "package.json"), "utf8"));
  const rootPackageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  expect(packageJson.private).toBe(true);
  expect(packageJson.type).toBe("module");
  expect(packageJson.dependencies["@openai/codex-sdk"]).toBe(rootPackageJson.dependencies["@openai/codex-sdk"]);

  expect(readFileSync(join(tmp, "imps", ".gitignore"), "utf8")).toBe("node_modules/\n.tmp/\n");

  const manifestText = readFileSync(join(tmp, "imps", "imps.manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  expect(manifest.schema).toBe(1);
  expect(manifest.layout).toBe("imps-local-lib");
  expect(manifest.agentImport).toBe("./lib/isolated.ts");
  expect(manifestText).not.toContain(ROOT);
  expect(manifestText).not.toContain(tmp);
  expect(manifest.files).toHaveLength(PROJECT_RUNTIME_FILES.length);
  expect(manifest.files.map((f: any) => f.path).sort()).toEqual(
    PROJECT_RUNTIME_FILES.map((file) => `lib/${file}`).sort(),
  );
  for (const file of manifest.files) {
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
  }
});

test("running init twice skips unchanged runtime files", async () => {
  const tmp = tempProject();
  const first = await runImps(["init", "--dir", tmp, "--no-install", "--json"]);
  expect(first.code).toBe(0);

  const second = await runImps(["init", "--dir", tmp, "--no-install", "--json"]);
  expect(second.code).toBe(0);
  const json = JSON.parse(second.stdout);
  expect(json.files.every((f: any) => f.status === "unchanged")).toBe(true);
});

test("modified vendored runtime file refuses to overwrite without force", async () => {
  const tmp = tempProject();
  const first = await runImps(["init", "--dir", tmp, "--no-install", "--json"]);
  expect(first.code).toBe(0);

  const dest = join(tmp, "imps", "lib", "isolated.ts");
  writeFileSync(dest, "// local edit\n", "utf8");
  const result = await runImps(["init", "--dir", tmp, "--no-install", "--json"]);
  expect(result.code).toBe(1);
  const payload = JSON.parse(result.stdout);
  expect(payload.ok).toBe(false);
  expect(payload.error).toContain("--force");
  expect(payload.conflicts).toContain("imps/lib/isolated.ts");
  expect(readFileSync(dest, "utf8")).toBe("// local edit\n");
});

test("force restores modified vendored runtime files", async () => {
  const tmp = tempProject();
  const first = await runImps(["init", "--dir", tmp, "--no-install", "--json"]);
  expect(first.code).toBe(0);

  const source = readFileSync(join(ROOT, "lib", "isolated.ts"), "utf8");
  const dest = join(tmp, "imps", "lib", "isolated.ts");
  writeFileSync(dest, "// local edit\n", "utf8");
  const result = await runImps(["init", "--dir", tmp, "--force", "--no-install", "--json"]);
  expect(result.code).toBe(0);
  expect(readFileSync(dest, "utf8")).toBe(source);
});
