import { spawnSync, type StdioOptions } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

export const PROJECT_RUNTIME_FILES = [
  "isolated.ts",
  "imp.ts",
  "appserver.ts",
  "codex-runtime.ts",
  "defaults.ts",
  "evolution.ts",
  "evolution-evaluator.ts",
] as const;

export type InitCopiedFileStatus = "created" | "unchanged" | "updated";

export interface InitCopiedFile {
  path: string;
  sha256: string;
  status: InitCopiedFileStatus;
}

export interface InitProjectImpsOptions {
  dir?: string;
  force?: boolean;
  noInstall?: boolean;
  installStdio?: StdioOptions;
}

export interface InitProjectImpsResult {
  ok: true;
  projectRoot: string;
  impsDir: string;
  libDir: string;
  layout: "imps-local-lib";
  agentImport: "./lib/isolated.ts";
  runtimePackageVersion: string;
  sdkDependencyVersion: string;
  installed: boolean;
  files: InitCopiedFile[];
  manifestPath: string;
}

export class InitProjectImpsConflictError extends Error {
  conflicts: string[];

  constructor(conflicts: string[]) {
    super(
      [
        "refusing to overwrite changed project-local imps runtime files:",
        ...conflicts.map((path) => `  ${path}`),
        "Run imps init --force to restore vendored runtime files.",
      ].join("\n"),
    );
    this.name = "InitProjectImpsConflictError";
    this.conflicts = conflicts;
  }
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readPackageJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function initProjectImps(options: InitProjectImpsOptions = {}): Promise<InitProjectImpsResult> {
  const projectRoot = resolve(options.dir ?? process.cwd());
  const impsDir = join(projectRoot, "imps");
  const libDir = join(impsDir, "lib");
  const packageJsonPath = join(impsDir, "package.json");
  const gitignorePath = join(impsDir, ".gitignore");
  const manifestPath = join(impsDir, "imps.manifest.json");
  const sourcePackage = readPackageJson(join(import.meta.dir, "..", "package.json"));
  const runtimePackageVersion = String(sourcePackage.version ?? "");
  const sdkDependencyVersion = sourcePackage.dependencies?.["@openai/codex-sdk"];

  if (typeof sdkDependencyVersion !== "string" || sdkDependencyVersion.length === 0) {
    throw new Error("codex-imps package.json is missing dependencies.@openai/codex-sdk");
  }

  mkdirSync(libDir, { recursive: true });

  const planned = PROJECT_RUNTIME_FILES.map((file) => {
    const sourcePath = join(import.meta.dir, file);
    const destPath = join(libDir, file);
    const sourceBytes = readFileSync(sourcePath);
    const sourceHash = sha256(sourceBytes);
    const manifestPath = `lib/${file}`;
    const exists = existsSync(destPath);
    const matches = exists ? sha256(readFileSync(destPath)) === sourceHash : false;
    const status: InitCopiedFileStatus = !exists ? "created" : matches ? "unchanged" : "updated";
    return { file, sourceBytes, sourceHash, destPath, manifestPath, status };
  });

  const conflicts = planned
    .filter((file) => file.status === "updated" && !options.force)
    .map((file) => `imps/${file.manifestPath}`);
  if (conflicts.length > 0) {
    throw new InitProjectImpsConflictError(conflicts);
  }

  for (const file of planned) {
    if (file.status !== "unchanged") {
      writeFileSync(file.destPath, file.sourceBytes);
    }
  }

  const files: InitCopiedFile[] = planned.map((file) => ({
    path: file.manifestPath,
    sha256: file.sourceHash,
    status: file.status,
  }));

  writeFileSync(
    packageJsonPath,
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "@openai/codex-sdk": sdkDependencyVersion,
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(gitignorePath, "node_modules/\n.tmp/\n");
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        schema: 1,
        runtimePackage: "codex-imps",
        runtimePackageVersion,
        sdkDependencyVersion,
        generatedAt: new Date().toISOString(),
        layout: "imps-local-lib",
        agentImport: "./lib/isolated.ts",
        files: files.map(({ path, sha256 }) => ({ path, sha256 })),
      },
      null,
      2,
    )}\n`,
  );

  let installed = false;
  if (!options.noInstall) {
    const install = spawnSync("bun", ["install"], {
      cwd: impsDir,
      encoding: "utf8",
      stdio: options.installStdio ?? "inherit",
    });
    if (install.status !== 0) {
      const detail = typeof install.stderr === "string" && install.stderr.trim() ? `\n${install.stderr.trim()}` : "";
      throw new Error(`bun install failed in ${impsDir}${detail}`);
    }
    installed = true;
  }

  return {
    ok: true,
    projectRoot,
    impsDir,
    libDir,
    layout: "imps-local-lib",
    agentImport: "./lib/isolated.ts",
    runtimePackageVersion,
    sdkDependencyVersion,
    installed,
    files,
    manifestPath,
  };
}
