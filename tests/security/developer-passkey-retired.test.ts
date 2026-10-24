/**
 * Developer portal password authentication and privileged function authorization guards.
 * Verifies:
 *   1. Successful password authentication and rejection of incorrect passwords.
 *   2. Server-side authorization protection (RPCs do not accept passkey bypass;
 *      privileged functions reject unauthorized direct requests).
 *   3. Developer portal UI consistency with the restored password flow.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { verifyDevPassword } from "../../src/lib/dev-auth";
import {
  handleAiKeyInventory,
  handleAiKeyTest,
  AiRequestError,
} from "../../src/lib/ai-handlers.server";

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

describe("developer portal password authentication", () => {
  test("successful login with correct password", async () => {
    expect(await verifyDevPassword("Pulse_2026")).toBe(true);
    expect(await verifyDevPassword("  Pulse_2026  ")).toBe(true);
  });

  test("rejection of incorrect passwords", async () => {
    expect(await verifyDevPassword("wrong_password")).toBe(false);
    expect(await verifyDevPassword("pulse_2026")).toBe(false);
    expect(await verifyDevPassword("PULSE_2026")).toBe(false);
    expect(await verifyDevPassword("Pulse_2025")).toBe(false);
    expect(await verifyDevPassword("")).toBe(false);
    expect(await verifyDevPassword("   ")).toBe(false);
    expect(await verifyDevPassword(null as unknown as string)).toBe(false);
    expect(await verifyDevPassword(undefined as unknown as string)).toBe(false);
  });

  test("developer portal UI contains restored password login form", () => {
    const code = read(join(SRC, "routes", "developer.tsx"));
    expect(code).toContain("verifyDevPassword");
    expect(code).toContain('placeholder="Enter Developer Password"');
    expect(code).toContain("Developer Password Required");
    expect(code).toContain("Authenticate Developer Access");
  });
});

describe("privileged backend operations remain protected", () => {
  test("every dev_passkey argument sent to an RPC is null or omitted", () => {
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

  test("unauthorized direct requests to privileged functions are rejected", async () => {
    // Unauthenticated requests to privileged AI key diagnostics must fail with 401
    await expect(handleAiKeyInventory(undefined, undefined)).rejects.toThrow(AiRequestError);
    await expect(handleAiKeyTest(undefined, { provider: "groq", index: 0 })).rejects.toThrow(
      AiRequestError,
    );

    // Invalid bearer tokens must also fail
    await expect(handleAiKeyInventory("Bearer invalid-token", undefined)).rejects.toThrow(
      AiRequestError,
    );
    await expect(
      handleAiKeyTest("Bearer invalid-token", { provider: "groq", index: 0 }),
    ).rejects.toThrow(AiRequestError);
  });
});

describe("developer portal: documentation hygiene", () => {
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
