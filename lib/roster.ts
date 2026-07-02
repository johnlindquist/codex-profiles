/**
 * Shared imp discovery for the `imp` router and `imps` fleet CLI.
 *
 * Imps live in the core imps/ directory plus any overlay directories the user
 * registers (personal repos, project-local fleets). Overlays come from:
 *   - IMPS_PATH        colon-separated directories, highest precedence
 *   - ~/.config/imps/dirs   one directory per line, # comments allowed
 *
 * Route metadata lives inside each imp file: an imp exports its `config`
 * (with an optional `route`) and only executes when run directly
 * (`if (import.meta.main) runImp(config)`). The router derives its table by
 * importing imp modules, cached by mtime so the common path never imports.
 * Files without an `export const config`/`export const route` marker are
 * never imported — importing a legacy imp would execute it.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export interface ImpRouteMeta {
  /** Word-boundary keyword alternation (RegExp source, matched case-insensitively). */
  pattern: string;
  hint: string;
  /** Breaks exact score ties; higher wins. Default 0. */
  priority?: number;
}

export interface ImpRoute extends Required<Omit<ImpRouteMeta, "priority">> {
  name: string;
  path: string;
  priority: number;
}

const ROUTE_CACHE_FILE = join(homedir(), ".cache", "codex-imps", "routes.json");
const EXPORT_MARKER = /export const (config|route)\b/;

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

/** Overlay imp directories registered via IMPS_PATH or ~/.config/imps/dirs. */
export function extraImpDirs(): string[] {
  const dirs: string[] = [];
  for (const part of (process.env.IMPS_PATH ?? "").split(":")) {
    if (part.trim()) dirs.push(expandHome(part.trim()));
  }
  const listFile = join(homedir(), ".config", "imps", "dirs");
  if (existsSync(listFile)) {
    for (const line of readFileSync(listFile, "utf8").split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) dirs.push(expandHome(t));
    }
  }
  return dirs;
}

/** Core dir first, then overlays; existing dirs only, deduped. */
export function impScanDirs(coreDir: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of [coreDir, ...extraImpDirs()]) {
    if (!seen.has(dir) && existsSync(dir)) {
      seen.add(dir);
      out.push(dir);
    }
  }
  return out;
}

/** All imp executables across scan dirs. Earlier dirs win name collisions. */
export function listImps(dirs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (/^imp-[a-z0-9-]+$/.test(f) && !map.has(f)) map.set(f, join(dir, f));
    }
  }
  return map;
}

interface RouteCacheEntry {
  mtimeMs: number;
  route: ImpRouteMeta | null;
}

/**
 * Route table for the given imps. Imports each imp module once (guarded by the
 * export marker) and caches its route by mtime, so repeat invocations are
 * pure JSON reads.
 */
export async function loadRoutes(imps: Map<string, string>): Promise<ImpRoute[]> {
  let cache: Record<string, RouteCacheEntry> = {};
  try {
    cache = JSON.parse(readFileSync(ROUTE_CACHE_FILE, "utf8"));
  } catch {}

  const next: Record<string, RouteCacheEntry> = {};
  const routes: ImpRoute[] = [];
  let dirty = false;

  for (const [name, path] of imps) {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch {
      continue;
    }
    let entry = cache[path];
    if (!entry || entry.mtimeMs !== mtimeMs) {
      dirty = true;
      entry = { mtimeMs, route: null };
      let src = "";
      try {
        src = readFileSync(path, "utf8");
      } catch {}
      if (EXPORT_MARKER.test(src)) {
        try {
          const mod = await import(path);
          const route: ImpRouteMeta | undefined = mod.config?.route ?? mod.route;
          if (route?.pattern && route?.hint) {
            entry.route = { pattern: route.pattern, hint: route.hint, priority: route.priority };
          }
        } catch {
          // Broken imp module: leave unroutable; running it directly will surface the error.
        }
      }
    }
    next[path] = entry;
    if (entry.route) {
      routes.push({ name, path, pattern: entry.route.pattern, hint: entry.route.hint, priority: entry.route.priority ?? 0 });
    }
  }

  if (dirty || Object.keys(next).length !== Object.keys(cache).length) {
    try {
      mkdirSync(dirname(ROUTE_CACHE_FILE), { recursive: true });
      writeFileSync(ROUTE_CACHE_FILE, JSON.stringify(next));
    } catch {}
  }

  return routes.sort((a, b) => a.name.localeCompare(b.name));
}
