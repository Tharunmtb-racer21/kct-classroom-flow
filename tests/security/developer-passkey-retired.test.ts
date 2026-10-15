/**
 * Source guard for the developer passkey retirement.
 * Contains no passkey, hash, or credential value.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const SRC = join(ROOT, "src");

function listFiles(dir: string, pattern: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) listFiles(path, pattern, out);
    else if (pattern.test(name)) out.push(path);
  }
  return out;
}

const sourceFiles = listFiles(SRC, /\.(ts|tsx|js|jsx|mjs)$/);
const read = (path: string) => readFileSync(path, "utf8");
const rel = (path: string) => relative(ROOT, path);

describe("developer passkey retirement: client source", () => {
  test("the client-side passkey hash module is gone and nothing imports it", () => {
    expect(existsSync(join(SRC, "lib", "dev-auth.ts"))).toBe(false);
    const importers = sourceFiles.filter((f) => /dev-auth|verifyDevPassword/.test(read(f)));
    expect(importers.map(rel)).toEqual([]);
  });

  test("no 64-character hex digest literal appears in client source", () => {
    const hits = sourceFiles.filter((f) => /\b[a-f0-9]{64}\b/i.test(read(f))).map(rel);
    expect(hits).toEqual([]);
  });

  test("every dev_passkey argument sent to an RPC is null", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (file.endsWith(join("integrations", "supabase", "types.ts"))) continue;
      const code = read(file);
      for (const m of code.matchAll(/dev_passkey\s*:\s*([^,}\n]+)/g)) {
        if (m[1].trim() !== "null") {
          offenders.push(`${rel(file)}: dev_passkey: ${m[1].trim().slice(0, 30)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no code writes developer auth flags or passkeys to browser storage", () => {
    const hits = sourceFiles
      .filter((f) => /(localStorage|sessionStorage)\.setItem\(\s*["'`]kct_dev_/.test(read(f)))
      .map(rel);
    expect(hits).toEqual([]);
  });

  test("both developer pages use the admin access gate", () => {
    for (const page of ["developer.tsx", "developer-waf.tsx"]) {
      const code = read(join(SRC, "routes", page));
      expect(code).toContain("checkDeveloperAccess");
      expect(code).toContain("clearLegacyDeveloperStorage");
      expect(code).not.toMatch(/type="password"[\s\S]{0,200}Developer Password/);
    }
  });
});

describe("developer passkey retirement: documentation", () => {
  const docs = [
    ...readdirSync(ROOT)
      .filter((n) => n.endsWith(".md"))
      .map((n) => join(ROOT, n)),
    ...listFiles(SRC, /\.md$/),
  ];

  test("no tracked Markdown file labels a quoted value as a password or passkey", () => {
    const offenders: string[] = [];
    for (const file of docs) {
      read(file)
        .split(/\r?\n/)
        .forEach((line, i) => {
          const labelledBacktick = /(password|passkey)[^`\n]{0,40}`[^`\n]+`/i.test(line);
          const labelledColon = /(password|passkey)\s*:\s*[^\s)|`_]{4,}/i.test(line);
          if (labelledBacktick || labelledColon) offenders.push(`${rel(file)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
