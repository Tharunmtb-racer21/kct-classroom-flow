/**
 * Static review of supabase/migrations/20261014090000_retire_developer_passkey.sql.
 *
 * These checks read the SQL text only. They do NOT execute it against PostgreSQL.
 * Execution tests live in supabase/tests/developer_rpc_admin_only.test.sql and have
 * not been run (no local or staging PostgreSQL environment was available).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(import.meta.dir, "..", "..", "supabase", "migrations");
const FILE = "20261014090000_retire_developer_passkey.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");

const RPCS: Array<[name: string, args: string]> = [
  ["get_developer_faculty_profiles", "text"],
  ["developer_demote_live_sessions", "text, uuid[]"],
  ["get_developer_login_logs", "text, integer"],
  ["get_developer_waf_stats", "text"],
  ["get_developer_waf_logs", "text, integer"],
  ["get_developer_contact_messages", "text, integer"],
  ["developer_delete_contact_message", "text, uuid"],
  ["developer_update_contact_message_status", "text, uuid, text"],
  ["get_developer_access_logs", "text, integer"],
  ["clear_developer_access_logs", "text"],
];

const stripComments = (s: string) => s.replace(/--[^\n]*/g, "");
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

interface FnDef {
  params: string;
  returns: string;
  body: string;
  header: string;
}

/** Extracts CREATE OR REPLACE FUNCTION public.<name> definitions from SQL text. */
function extractFunctions(text: string): Map<string, FnDef> {
  const out = new Map<string, FnDef>();
  const code = stripComments(text);
  const re = /CREATE OR REPLACE FUNCTION public\.([a-z_]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const name = m[1];
    let depth = 1;
    let i = re.lastIndex;
    while (depth > 0 && i < code.length) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") depth--;
      i++;
    }
    const params = code.slice(re.lastIndex, i - 1);
    const rest = code.slice(i);
    const bodyStart = rest.search(/AS \$\$/);
    const header = rest.slice(0, bodyStart);
    const returns = (header.match(/RETURNS([\s\S]*?)LANGUAGE/i) ?? [])[1] ?? "";
    const bodyEnd = rest.indexOf("$$", bodyStart + 5);
    const body = rest.slice(bodyStart + 5, bodyEnd);
    out.set(name, { params: norm(params), returns: norm(returns), body, header: norm(header) });
  }
  return out;
}

const current = extractFunctions(sql);

/** Most recent definition of each function in migrations that precede this one. */
const previous = new Map<string, FnDef>();
for (const file of readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql") && f < FILE)
  .sort()) {
  for (const [name, def] of extractFunctions(readFileSync(join(MIGRATIONS, file), "utf8"))) {
    previous.set(name, def);
  }
}

describe("retire_developer_passkey migration (static)", () => {
  test("runs atomically", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
  });

  test("contains no digest literal, no passkey verification and no hash assignment", () => {
    const code = stripComments(sql);
    expect(code).not.toMatch(/\b[a-f0-9]{64}\b/i);
    expect(code).not.toMatch(/encode\s*\(\s*digest\s*\(/i);
    expect(code).not.toMatch(/valid_pass_hash\s+text\s*:=/i);
    expect(code).not.toMatch(/dev_passkey\s*(=|<>|!=|IS NOT NULL)/i);
  });

  test("uses public.auth_uid() and never auth.uid()", () => {
    const code = stripComments(sql);
    expect(code).not.toMatch(/\bauth\.uid\(\)/);
    const helper = current.get("is_platform_admin");
    expect(helper).toBeDefined();
    expect(helper!.body).toContain("public.auth_uid()");
    expect(helper!.body).toContain("public.has_role(v_uid, 'admin'::public.app_role)");
    expect(helper!.body).toContain("email_verified");
    expect(helper!.body).toContain("@kct\\.ac\\.in$");
    expect(helper!.header).toContain("security definer");
    expect(helper!.header).toContain("set search_path = public, pg_temp");
  });

  for (const [name, args] of RPCS) {
    describe(name, () => {
      const def = current.get(name);

      test("is redefined admin-only with a pinned search_path", () => {
        expect(def).toBeDefined();
        expect(def!.header).toContain("security definer");
        expect(def!.header).toContain("set search_path = public, pg_temp");
        const body = norm(def!.body);
        expect(body.startsWith("declare") || body.startsWith("begin")).toBe(true);
        // The admin check must run before any data access.
        const check = body.indexOf("if not public.is_platform_admin() then");
        expect(check).toBeGreaterThan(-1);
        for (const verb of [" select ", " update ", " delete ", " return query"]) {
          const at = body.indexOf(verb);
          if (at > -1) expect(check).toBeLessThan(at);
        }
        expect(body).toContain("errcode = '42501'");
      });

      test("keeps the exact parameter list, defaults and return type", () => {
        const prior = previous.get(name);
        expect(prior).toBeDefined();
        expect(def!.params).toBe(prior!.params);
        expect(def!.returns).toBe(prior!.returns);
      });

      test("revokes PUBLIC and anon and grants authenticated", () => {
        const sig = `public.${name}(${args})`.replace(/[()[\]]/g, "\\$&");
        expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon;`));
        expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated;`));
        expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${sig} TO[^;]*\\banon\\b`));
      });
    });
  }

  test("has preflight and postcondition guards", () => {
    expect(sql).toContain("DO $preflight$");
    expect(sql).toContain("DO $postcondition$");
    expect(sql).toContain("to_regprocedure('public.has_role(text,public.app_role)')");
    expect(sql).toMatch(/has_function_privilege\('anon', fn, 'EXECUTE'\)/);
    expect(sql).toMatch(/prosrc ILIKE '%digest\(dev_passkey%'/);
  });

  test("redefines only the helper and the ten RPCs", () => {
    expect([...current.keys()].sort()).toEqual(
      ["is_platform_admin", ...RPCS.map(([n]) => n)].sort(),
    );
  });
});
