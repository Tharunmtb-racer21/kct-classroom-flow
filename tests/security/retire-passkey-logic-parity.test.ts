/**
 * Logic-parity regression tests for 20261014090000_retire_developer_passkey.sql.
 *
 * For each of the ten developer RPCs, the new body must equal the latest previous
 * body once ONLY the authorization code is removed from both. Any other change to
 * query logic, limits or validation must be listed here as a deliberate deviation.
 *
 * Static text comparison only. Nothing here executes SQL.
 *
 * SAFETY: normalize() masks every 64-character hex value FIRST, so a failing assertion
 * can never print the retired passkey hash from the older migrations.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(import.meta.dir, "..", "..", "supabase", "migrations");
const FILE = "20261014090000_retire_developer_passkey.sql";

function bodies(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /CREATE OR REPLACE FUNCTION public\.([a-z_]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const asIdx = text.indexOf("AS $$", m.index);
    const end = text.indexOf("$$", asIdx + 5);
    out.set(m[1], text.slice(asIdx + 5, end));
  }
  return out;
}

const previous = new Map<string, string>();
for (const f of readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql") && f < FILE)
  .sort()) {
  for (const [k, v] of bodies(readFileSync(join(MIGRATIONS, f), "utf8"))) previous.set(k, v);
}
const current = bodies(readFileSync(join(MIGRATIONS, FILE), "utf8"));

const DENY_MESSAGE = "access denied: unauthorized developer request";
const DENY = "raiseexception'accessdenied:unauthorizeddeveloperrequest'";

/**
 * Masks hex digests, drops comments, lowercases, removes ALL whitespace, then removes
 * authorization-only code so the remaining text is pure query logic.
 */
function normalize(body: string): string {
  let s = body
    .replace(/[0-9a-f]{64}/gi, "<hash>")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "");
  // Retired passkey state variable.
  s = s.replace(/v?_?valid_pass_hashtext:='<hash>';/g, "");
  // Old combined admin-or-passkey guard.
  s = s.replace(
    new RegExp(
      "ifnot\\(public\\.has_role\\(public\\.auth_uid\\(\\),'admin'\\)or\\(dev_passkeyisnotnullanddev_passkey<>''" +
        "andencode\\(digest\\(dev_passkey,'sha256'\\),'hex'\\)=v?_?valid_pass_hash\\)\\)then" +
        DENY +
        ";endif;",
    ),
    "",
  );
  // Old passkey-only guard (demote).
  s = s.replace(
    new RegExp(
      "ifdev_passkeyisnullorencode\\(digest\\(dev_passkey,'sha256'\\),'hex'\\)!=valid_pass_hashthen" +
        DENY +
        ";endif;",
    ),
    "",
  );
  // New guard.
  s = s.replace(
    new RegExp("ifnotpublic\\.is_platform_admin\\(\\)then" + DENY + "usingerrcode='42501';endif;"),
    "",
  );
  // A DECLARE section left empty by removing the hash variable.
  return s.replace(/^declarebegin/, "begin");
}

const SIMPLE = [
  "developer_demote_live_sessions",
  "get_developer_waf_stats",
  "get_developer_contact_messages",
  "developer_delete_contact_message",
  "developer_update_contact_message_status",
  "get_developer_access_logs",
  "clear_developer_access_logs",
];

describe("developer RPC logic parity (static)", () => {
  test("normalization strips the authorization code it is meant to strip", () => {
    for (const name of [...SIMPLE, "get_developer_login_logs", "get_developer_waf_logs"]) {
      const old = normalize(previous.get(name)!);
      const cur = normalize(current.get(name)!);
      expect(old).not.toContain("dev_passkey");
      expect(old).not.toContain("<hash>");
      expect(cur).not.toContain("is_platform_admin");
    }
  });

  for (const name of SIMPLE) {
    test(`${name}: only the authorization changed`, () => {
      expect(previous.has(name)).toBe(true);
      expect(normalize(current.get(name)!)).toBe(normalize(previous.get(name)!));
    });
  }

  test("get_developer_faculty_profiles: same single query as the old admin path", () => {
    const query =
      "returnqueryselectp.id,p.full_name,p.email,p.avatar_url,p.created_atfrompublic.profilesporderbyp.created_atdesc;";
    expect(
      previous.get("get_developer_faculty_profiles")!.toLowerCase().replace(/\s+/g, ""),
    ).toContain(query);
    expect(normalize(current.get("get_developer_faculty_profiles")!)).toBe(`begin${query}end;`);
  });

  test("get_developer_login_logs: only authorization and explicit ::text casts changed", () => {
    const strip = (s: string) => normalize(s).replace(/::text/g, "");
    expect(strip(current.get("get_developer_login_logs")!)).toBe(
      strip(previous.get("get_developer_login_logs")!),
    );
  });

  test("get_developer_login_logs: session_duration is cast to text", () => {
    // 20260803230000 created login_logs.session_duration as INTEGER; 20261006140000 used
    // CREATE TABLE IF NOT EXISTS with TEXT, which does not alter an existing table. The
    // RPC declares the column as text, so the cast is required for an integer column.
    expect(current.get("get_developer_login_logs")!).toContain("l.session_duration::text");
  });

  test("get_developer_waf_logs: only authorization and the documented null-limit fallback changed", () => {
    // DEVIATION PENDING DECISION: the new body uses COALESCE(p_limit, 50). The old body
    // returned 1 row for an explicit NULL limit. No caller passes NULL (all pass 50).
    const cur = normalize(current.get("get_developer_waf_logs")!).replace(
      "coalesce(p_limit,50)",
      "p_limit",
    );
    expect(cur).toBe(normalize(previous.get("get_developer_waf_logs")!));
  });

  test("every RPC keeps the original denial message", () => {
    for (const name of [
      ...SIMPLE,
      "get_developer_faculty_profiles",
      "get_developer_login_logs",
      "get_developer_waf_logs",
    ]) {
      expect(current.get(name)!.toLowerCase()).toContain(`raise exception '${DENY_MESSAGE}'`);
    }
  });
});
