// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, dirname, resolve } from "node:path";

/**
 * scripts/package.json is the production image's only dependency tree for the
 * maintenance scripts and the lib/ code they import (see Dockerfile,
 * scripts-deps stage). These checks keep it in step with the root manifest.
 */

const root = resolve(__dirname, "../..");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

const scriptsManifest = readJson("scripts/package.json");
const scriptsLock = readJson("scripts/package-lock.json");
const rootLock = readJson("package-lock.json");
const scriptDeps: Record<string, string> = scriptsManifest.dependencies;

/** Value imports (not `import type`) of a JS/TS source file. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

/** The file an `@/` or relative specifier names, trying the TypeScript extensions. */
function resolveLocal(specifier: string, fromFile: string): string | null {
  const base = specifier.startsWith("@/") ? join(root, specifier.slice(2)) : resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Every npm package reachable from the scripts through static value imports. */
function packagesUsedByScripts(): Map<string, string> {
  const usedBy = new Map<string, string>();
  const seen = new Set<string>();
  const queue = readdirSync(join(root, "scripts"))
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => join(root, "scripts", f));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    // The generated client's own imports are @prisma/* runtime packages, declared directly.
    if (file.includes("/generated/prisma/")) continue;
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith("node:") || builtinModules.includes(specifier.split("/")[0])) continue;
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const target = resolveLocal(specifier, file);
        if (!target) throw new Error(`${file}: cannot resolve ${specifier}`);
        queue.push(target);
        continue;
      }
      if (!usedBy.has(packageName(specifier))) usedBy.set(packageName(specifier), file.slice(root.length + 1));
    }
  }
  return usedBy;
}

describe("scripts/package.json", () => {
  it("pins each dependency to the version the root lockfile resolves", () => {
    for (const [name, version] of Object.entries(scriptDeps)) {
      expect({ name, version }).toEqual({ name, version: rootLock.packages[`node_modules/${name}`]?.version });
    }
  });

  it("locks every package, transitive ones included, at the root lockfile's version", () => {
    const drift = Object.entries(scriptsLock.packages as Record<string, { version?: string }>)
      .filter(([path]) => path !== "")
      .filter(([path, entry]) => rootLock.packages[path]?.version !== entry.version)
      .map(([path, entry]) => `${path}: scripts ${entry.version}, root ${rootLock.packages[path]?.version}`);
    expect(drift).toEqual([]);
  });

  it("lists the same dependencies as its lockfile", () => {
    expect(scriptsLock.packages[""].dependencies).toEqual(scriptDeps);
  });

  it("declares every package the scripts and the lib/ modules they import use", () => {
    const missing = [...packagesUsedByScripts()]
      .filter(([name]) => !(name in scriptDeps))
      .map(([name, file]) => `${name} (imported by ${file})`);
    expect(missing).toEqual([]);
  });
});
