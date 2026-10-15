/**
 * Verifies scripts/check-client-bundle-secrets.mjs detects leaked env values and
 * credential patterns without ever printing the secret values themselves.
 * Uses a throwaway directory with synthetic values only.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "..", "scripts", "check-client-bundle-secrets.mjs");

// Synthetic test values, not real credentials.
const FAKE_SECRET = "synthetic-server-secret-value-0123456789";
const FAKE_GROQ = `gsk_${"A".repeat(48)}`;
const PUBLIC_URL = "https://example-project.supabase.co";

let dir: string;

function run(cwd: string, args: string[]) {
  const proc = Bun.spawnSync(["node", SCRIPT, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    code: proc.exitCode,
    out: proc.stdout.toString() + proc.stderr.toString(),
  };
}

function project(name: string, env: string, bundle: string) {
  const root = join(dir, name);
  mkdirSync(join(root, "build"), { recursive: true });
  writeFileSync(join(root, ".env.local"), env);
  writeFileSync(join(root, "build", "app.js"), bundle);
  return root;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "kct-bundle-scan-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("check-client-bundle-secrets", () => {
  test("passes a bundle that contains only public client values", () => {
    const root = project(
      "clean",
      `VITE_SUPABASE_URL="${PUBLIC_URL}"\nSUPABASE_URL="${PUBLIC_URL}"\nSERVER_TOKEN="${FAKE_SECRET}"\n`,
      `const url = "${PUBLIC_URL}";`,
    );
    const { code, out } = run(root, ["build"]);
    expect(code).toBe(0);
    expect(out).toContain("Env value leaks: 0");
  });

  test("fails on a leaked non-public env value and prints only its name", () => {
    const root = project(
      "leak",
      `VITE_AI_SECRET="${FAKE_SECRET}"\n`,
      `const env = { VITE_AI_SECRET: "${FAKE_SECRET}" };`,
    );
    const { code, out } = run(root, ["build"]);
    expect(code).toBe(1);
    expect(out).toContain("ENV VALUE LEAK  VITE_AI_SECRET from .env.local");
    expect(out).toContain("WARNING  Non-public VITE_ variables");
    expect(out).not.toContain(FAKE_SECRET);
  });

  test("detects reversed env values", () => {
    const reversed = FAKE_SECRET.split("").reverse().join("");
    const root = project("reversed", `OTHER_SECRET=${FAKE_SECRET}\n`, `const k = "${reversed}";`);
    const { code, out } = run(root, ["build"]);
    expect(code).toBe(1);
    expect(out).toContain("OTHER_SECRET from .env.local (reversed)");
    expect(out).not.toContain(FAKE_SECRET);
    expect(out).not.toContain(reversed);
  });

  test("detects known key formats without printing them", () => {
    const root = project("pattern", "", `const k = "${FAKE_GROQ}";`);
    const { code, out } = run(root, ["build", "--no-env"]);
    expect(code).toBe(1);
    expect(out).toContain("CREDENTIAL  groq key: 1 match(es)");
    expect(out).not.toContain(FAKE_GROQ);
  });
});
