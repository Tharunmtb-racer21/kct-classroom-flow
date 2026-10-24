import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(import.meta.dir, "..", "..", "supabase", "migrations");
const FILE = "20260717160000_firebase_fresh_install.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");

describe("20260717160000_firebase_fresh_install migration idempotence & safety", () => {
  test("does not contain unguarded top-level CREATE TYPE statements", () => {
    // Unconditional CREATE TYPE without IF NOT EXISTS / DO block checks
    const topLevelBareCreateType = /^CREATE TYPE\s+/m;
    expect(topLevelBareCreateType.test(sql)).toBe(false);

    // Each CREATE TYPE must be guarded by an IF NOT EXISTS check on pg_type
    const createTypeMatches = sql.match(/CREATE TYPE public\.([a-z_]+)/g) || [];
    expect(createTypeMatches.length).toBe(3); // app_role, session_status, question_type
    for (const match of createTypeMatches) {
      const typeName = match.replace("CREATE TYPE public.", "");
      expect(sql).toContain(`typname = '${typeName}'`);
    }
  });

  test("guards and reconciles app_role enum labels", () => {
    expect(sql).toContain("typname = 'app_role'");
    expect(sql).toContain("enumlabel = 'faculty'");
    expect(sql).toContain("enumlabel = 'admin'");
    expect(sql).toContain("ALTER TYPE public.app_role ADD VALUE 'faculty'");
    expect(sql).toContain("ALTER TYPE public.app_role ADD VALUE 'admin'");
  });

  test("guards and reconciles session_status and question_type enum labels", () => {
    expect(sql).toContain("typname = 'session_status'");
    expect(sql).toContain("ALTER TYPE public.session_status ADD VALUE 'draft'");
    expect(sql).toContain("ALTER TYPE public.session_status ADD VALUE 'live'");
    expect(sql).toContain("ALTER TYPE public.session_status ADD VALUE 'ended'");

    expect(sql).toContain("typname = 'question_type'");
    expect(sql).toContain("ALTER TYPE public.question_type ADD VALUE 'wordcloud'");
    expect(sql).toContain("ALTER TYPE public.question_type ADD VALUE 'poll'");
    expect(sql).toContain("ALTER TYPE public.question_type ADD VALUE 'quiz'");
  });

  test("uses CREATE TABLE IF NOT EXISTS for all core tables", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.profiles");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.user_roles");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.sessions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.questions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.participants");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.responses");
  });

  test("guards foreign key constraint sessions_current_question_fk", () => {
    expect(sql).toContain("conname = 'sessions_current_question_fk'");
    expect(sql).toContain("ALTER TABLE public.sessions ADD CONSTRAINT sessions_current_question_fk");
  });

  test("guards supabase_realtime publication creation and table additions", () => {
    expect(sql).toContain("pubname = 'supabase_realtime'");
    expect(sql).toContain("pg_publication_rel");
    expect(sql).not.toContain("DROP PUBLICATION IF EXISTS supabase_realtime;");
  });

  test("drops legacy policies before recreation", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Anyone can view sessions" ON public.sessions;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Faculty manage own sessions" ON public.sessions;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Anyone view questions" ON public.questions;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Faculty manage own questions" ON public.questions;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Anyone view participants" ON public.participants;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Anyone view responses" ON public.responses;');
  });
});
