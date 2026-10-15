-- developer_rpc_admin_only.test.sql
--
-- STATUS: UNEXECUTED. Written for review; it has NOT been run against any PostgreSQL
-- database. No local Docker/Supabase stack, psql, or staging database was available
-- when it was written.
--
-- Purpose: verify migration 20261014090000_retire_developer_passkey.sql on a LOCAL or
-- STAGING database only (never production):
--   * anon cannot execute any of the ten developer RPCs;
--   * an authenticated non-admin is denied;
--   * an admin with an unverified email, or a non-KCT email, is denied;
--   * a verified @kct.ac.in admin is allowed;
--   * any dev_passkey value is ignored (an arbitrary placeholder string is used; no real
--     passkey appears in this file);
--   * no function body still verifies a passkey.
--
-- How to run (local stack): `supabase start`, apply migrations to the LOCAL database
-- with `supabase db reset`, then `supabase test db`. Requires the pgtap extension.
-- Everything runs inside a transaction and is rolled back.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

-- 10 privilege + 1 source + 10 anon + 10 non-admin + 10 unverified + 5 non-KCT + 2 admin
SELECT plan(48);

-- ─── Fixtures (as the migration owner) ──────────────────────────────────────
INSERT INTO public.profiles (id, email, full_name)
VALUES ('test-admin-uid', 'admin.test@kct.ac.in', 'Test Admin'),
       ('test-faculty-uid', 'faculty.test@kct.ac.in', 'Test Faculty')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
VALUES ('test-admin-uid', 'admin'), ('test-faculty-uid', 'faculty')
ON CONFLICT DO NOTHING;
INSERT INTO public.contact_messages (id, name, email, subject, message)
VALUES ('00000000-0000-4000-8000-000000000001', 'T', 't@kct.ac.in', 'S', 'M');

CREATE TEMP TABLE rpc_calls (label text, call text) ON COMMIT DROP;
INSERT INTO rpc_calls VALUES
  ('faculty_profiles', 'SELECT * FROM public.get_developer_faculty_profiles(''placeholder-not-a-passkey'')'),
  ('demote', 'SELECT public.developer_demote_live_sessions(''placeholder-not-a-passkey'', ARRAY[]::uuid[])'),
  ('login_logs', 'SELECT * FROM public.get_developer_login_logs(''placeholder-not-a-passkey'', 5)'),
  ('waf_stats', 'SELECT public.get_developer_waf_stats(''placeholder-not-a-passkey'')'),
  ('waf_logs', 'SELECT * FROM public.get_developer_waf_logs(''placeholder-not-a-passkey'', 5)'),
  ('contact_messages', 'SELECT * FROM public.get_developer_contact_messages(''placeholder-not-a-passkey'', 5)'),
  ('delete_message', 'SELECT public.developer_delete_contact_message(''placeholder-not-a-passkey'', ''00000000-0000-4000-8000-000000000002''::uuid)'),
  ('update_status', 'SELECT public.developer_update_contact_message_status(''placeholder-not-a-passkey'', ''00000000-0000-4000-8000-000000000001''::uuid, ''read'')'),
  ('access_logs', 'SELECT * FROM public.get_developer_access_logs(''placeholder-not-a-passkey'', 5)'),
  ('clear_access_logs', 'SELECT public.clear_developer_access_logs(''placeholder-not-a-passkey'')');
GRANT SELECT ON rpc_calls TO anon, authenticated;

-- ─── Privileges (10) ────────────────────────────────────────────────────────
SELECT is(has_function_privilege('anon', p, 'EXECUTE'), false, 'anon cannot execute ' || p)
FROM unnest(ARRAY[
  'public.get_developer_faculty_profiles(text)',
  'public.developer_demote_live_sessions(text,uuid[])',
  'public.get_developer_login_logs(text,integer)',
  'public.get_developer_waf_stats(text)',
  'public.get_developer_waf_logs(text,integer)',
  'public.get_developer_contact_messages(text,integer)',
  'public.developer_delete_contact_message(text,uuid)',
  'public.developer_update_contact_message_status(text,uuid,text)',
  'public.get_developer_access_logs(text,integer)',
  'public.clear_developer_access_logs(text)'
]) AS p;

-- ─── No passkey verification remains (1) ────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.prosrc ILIKE '%digest(dev_passkey%' OR p.prosrc ILIKE '%valid_pass_hash%')),
  0,
  'no public function body verifies a passkey'
);

-- Helper: run every RPC as the given role and claims, expecting denial.
CREATE OR REPLACE FUNCTION pg_temp.expect_all_denied(p_claims text, p_role text, p_label text)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM rpc_calls LOOP
    PERFORM set_config('request.jwt.claims', coalesce(p_claims, ''), true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    RETURN NEXT throws_ok(r.call, '42501', NULL, p_label || ': ' || r.label || ' denied');
    RESET ROLE;
  END LOOP;
END $$;

-- ─── anon, with any passkey value (10) ──────────────────────────────────────
SELECT * FROM pg_temp.expect_all_denied(NULL, 'anon', 'anon with placeholder passkey');

-- ─── authenticated non-admin (10) ───────────────────────────────────────────
SELECT * FROM pg_temp.expect_all_denied(
  '{"sub":"test-faculty-uid","email":"faculty.test@kct.ac.in","email_verified":true,"role":"authenticated"}',
  'authenticated', 'non-admin faculty');

-- ─── admin with unverified email (10) ───────────────────────────────────────
SELECT * FROM pg_temp.expect_all_denied(
  '{"sub":"test-admin-uid","email":"admin.test@kct.ac.in","email_verified":false,"role":"authenticated"}',
  'authenticated', 'admin with unverified email');

-- ─── admin UID with a non-KCT email claim (5, sampled) ──────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"test-admin-uid","email":"admin.test@gmail.com","email_verified":true,"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.get_developer_waf_stats(NULL)', '42501', NULL, 'non-KCT email: waf_stats denied');
SELECT throws_ok('SELECT * FROM public.get_developer_contact_messages(NULL, 5)', '42501', NULL, 'non-KCT email: contact_messages denied');
SELECT throws_ok('SELECT public.clear_developer_access_logs(NULL)', '42501', NULL, 'non-KCT email: clear_access_logs denied');
SELECT throws_ok('SELECT * FROM public.get_developer_faculty_profiles(NULL)', '42501', NULL, 'non-KCT email: faculty_profiles denied');
SELECT throws_ok('SELECT public.developer_demote_live_sessions(NULL, ARRAY[]::uuid[])', '42501', NULL, 'non-KCT email: demote denied');
RESET ROLE;

-- ─── verified @kct.ac.in admin (2) ──────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"test-admin-uid","email":"admin.test@kct.ac.in","email_verified":true,"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ SELECT public.get_developer_waf_stats(NULL);
     SELECT * FROM public.get_developer_faculty_profiles(NULL);
     SELECT * FROM public.get_developer_login_logs(NULL, 5);
     SELECT * FROM public.get_developer_waf_logs(NULL, 5);
     SELECT * FROM public.get_developer_contact_messages(NULL, 5);
     SELECT * FROM public.get_developer_access_logs(NULL, 5);
     SELECT public.developer_demote_live_sessions(NULL, ARRAY[]::uuid[]);
     SELECT public.developer_update_contact_message_status(NULL, '00000000-0000-4000-8000-000000000001'::uuid, 'read');
     SELECT public.developer_delete_contact_message(NULL, '00000000-0000-4000-8000-000000000001'::uuid);
     SELECT public.clear_developer_access_logs(NULL); $$,
  'verified KCT admin can call all ten RPCs');
SELECT is(public.is_platform_admin(), true, 'is_platform_admin() is true for the verified KCT admin');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
