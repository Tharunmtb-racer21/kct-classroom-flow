/**
 * Guards against Vite inlining the whole environment object into the browser bundle.
 *
 * Vite replaces a static member expression like `import.meta.env.VITE_NAME` with that
 * single value. Any other use of the env object (assigning it to a variable, optional
 * chaining on it, indexing it with a variable, casting `import.meta`) makes Vite inline
 * the entire object, which includes every VITE_* variable in the build environment.
 *
 * This test also pins the set of VITE_ names client code may reference, so a new
 * secret cannot quietly gain a VITE_ prefix.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const SRC = join(ROOT, "src");

/** Public values the browser legitimately needs. Keep in sync with scripts/check-client-bundle-secrets.mjs. */
const ALLOWED_CLIENT_VITE_NAMES = new Set([
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_PUBLIC_APP_URL",
  "VITE_VERCEL_PROJECT_PRODUCTION_URL",
  "VITE_VERCEL_URL",
  "VITE_WEB3FORMS_ACCESS_KEY",
]);

/** Vite's built-in, non-secret env members. */
const BUILT_IN_MEMBERS = new Set(["DEV", "PROD", "MODE", "SSR", "BASE_URL"]);

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) listSourceFiles(path, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

/** Removes line comments and JSDoc/block comment lines so prose is not scanned. */
function stripComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("/*")) return "";
      return line.replace(/(^|\s)\/\/.*$/, "$1");
    })
    .join("\n");
}

// Server-only modules never reach the browser bundle.
const isServerOnly = (path: string) => /\.server\.(ts|tsx)$/.test(path);

const files = listSourceFiles(SRC).filter((f) => !isServerOnly(f));

describe("client environment access", () => {
  test("every import.meta use in client code is a static env member read", () => {
    const violations: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      const re = /import\.meta\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        const rest = code.slice(m.index + "import.meta".length);
        const member = /^\.env\.([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
        const isGlob = /^\.(glob|url|hot|dirname|filename|resolve)\b/.test(rest);
        if (!member && !isGlob) {
          const line = code.slice(0, m.index).split("\n").length;
          violations.push(`${relative(ROOT, file)}:${line}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("client code references only allowlisted VITE_ variables", () => {
    const unexpected = new Set<string>();
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const m of code.matchAll(/import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        const name = m[1];
        if (!BUILT_IN_MEMBERS.has(name) && !ALLOWED_CLIENT_VITE_NAMES.has(name)) {
          unexpected.add(`${name} in ${relative(ROOT, file)}`);
        }
      }
    }
    expect([...unexpected]).toEqual([]);
  });

  test("no client code mentions AI provider credential variables", () => {
    const pattern =
      /\b(VITE_)?(GROQ|GEMINI|GOOGLE_AI|NVIDIA|TOGETHER)_API_KEYS?\b|\bVITE_GOOGLE_AI_KEY\b/;
    const hits = files
      .filter((f) => pattern.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  test("the guard detects broad env-object access patterns", () => {
    const detect = (code: string) => {
      const rest = code.slice(code.indexOf("import.meta") + "import.meta".length);
      return !/^\.env\.[A-Za-z_]/.test(rest);
    };
    expect(detect("const env = (import.meta as any).env ?? {};")).toBe(true);
    expect(detect("const env = import.meta.env;")).toBe(true);
    expect(detect("import.meta.env?.VITE_X")).toBe(true);
    expect(detect("import.meta.env[key]")).toBe(true);
    expect(detect("import.meta.env.VITE_FIREBASE_API_KEY")).toBe(false);
  });
});
