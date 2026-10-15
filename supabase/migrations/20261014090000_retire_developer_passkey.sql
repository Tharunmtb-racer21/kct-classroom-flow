-- Migration: 20261014090000_retire_developer_passkey.sql
--
-- SECURITY CONTAINMENT: retire the shared developer passkey.
--
-- The developer passkey accepted by ten developer RPCs is compromised. This migration
-- removes the passkey branch from every one of those RPCs. After it runs, the RPCs
-- authorize ONLY a caller who satisfies public.is_platform_admin():
--   * public.auth_uid() (the verified Firebase UID, TEXT) has the 'admin' role in
--     public.user_roles, checked through public.has_role(text, app_role), and
--   * the verified JWT carries email_verified = true, and
--   * the JWT email is exactly one address at @kct.ac.in.
--
-- Signatures and return types are unchanged, so PostgREST routes and generated client
-- types keep working. The dev_passkey parameter is retained ONLY for signature
-- compatibility; it is ignored. A later migration can drop it once no client sends it.
--
-- This file intentionally contains no passkey and no passkey hash.
--
-- PREREQUISITES (verify on the confirmed production project before applying):
--   1. Supabase Third-Party Auth for Firebase is configured, so public.auth_uid()
--      returns the Firebase UID and request.jwt.claims carries email/email_verified.
--   2. At least one verified @kct.ac.in account has role 'admin' in public.user_roles.
--      Without it, the developer portal is locked for everyone (fails closed).
--   3. The live definitions of the ten functions match the signatures below. The
--      preflight block aborts the migration if they do not.
--
-- ROLLBACK POLICY: there is deliberately no down migration that restores passkey
-- authorization. Fix forward instead (grant the admin role, fix third-party auth,
-- or correct public.is_platform_admin()).
--
-- Apply manually after staging rehearsal. Never with `supabase db push`.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Preflight: refuse to run against an unexpected schema
-- ─────────────────────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
    expected text[] := ARRAY[
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
    ];
    sig text;
    unexpected text;
BEGIN
    -- Identity helpers this migration depends on.
    IF to_regprocedure('public.auth_uid()') IS NULL
       OR (SELECT prorettype FROM pg_proc WHERE oid = to_regprocedure('public.auth_uid()')) <> 'text'::regtype THEN
        RAISE EXCEPTION 'Preflight failed: public.auth_uid() returning text is required';
    END IF;
    IF to_regprocedure('public.has_role(text,public.app_role)') IS NULL THEN
        RAISE EXCEPTION 'Preflight failed: public.has_role(text, public.app_role) is required';
    END IF;

    -- Every expected RPC must exist with exactly this signature.
    FOREACH sig IN ARRAY expected LOOP
        IF to_regprocedure(sig) IS NULL THEN
            RAISE EXCEPTION 'Preflight failed: expected function % not found; live schema differs from repository', sig;
        END IF;
    END LOOP;

    -- No other function may accept a dev_passkey argument (it would stay unpatched).
    SELECT string_agg(p.oid::regprocedure::text, ', ')
      INTO unexpected
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proargnames IS NOT NULL
       AND 'dev_passkey' = ANY (p.proargnames)
       -- Compare by OID: regprocedure text omits the schema when it is on search_path.
       AND p.oid NOT IN (SELECT to_regprocedure(s)::oid FROM unnest(expected) AS s);
    IF unexpected IS NOT NULL THEN
        RAISE EXCEPTION 'Preflight failed: unexpected functions accept dev_passkey: %', unexpected;
    END IF;
END
$preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Admin authorization helper
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid text;
    v_claims jsonb;
    v_email text;
BEGIN
    -- Fail closed if the claims setting is missing or malformed.
    BEGIN
        v_uid := public.auth_uid();
    EXCEPTION WHEN others THEN
        RETURN false;
    END;
    IF v_uid IS NULL OR v_uid = '' THEN
        RETURN false;
    END IF;

    BEGIN
        v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    EXCEPTION WHEN others THEN
        RETURN false;
    END;
    IF v_claims IS NULL THEN
        RETURN false;
    END IF;

    -- Firebase ID tokens carry email_verified as a JSON boolean.
    IF lower(coalesce(v_claims ->> 'email_verified', 'false')) <> 'true' THEN
        RETURN false;
    END IF;

    v_email := lower(btrim(coalesce(v_claims ->> 'email', '')));
    IF v_email !~ '^[^@[:space:]]+@kct\.ac\.in$' THEN
        RETURN false;
    END IF;

    RETURN public.has_role(v_uid, 'admin'::public.app_role);
END;
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
    'True only for a verified @kct.ac.in Firebase identity whose UID has the admin role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Developer RPCs: admin-only, passkey argument ignored
-- ─────────────────────────────────────────────────────────────────────────────

-- 2.1 Faculty profiles
CREATE OR REPLACE FUNCTION public.get_developer_faculty_profiles(dev_passkey text DEFAULT NULL)
RETURNS TABLE (
    id text,
    full_name text,
    email text,
    avatar_url text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- dev_passkey is ignored; retained only for signature compatibility.
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.avatar_url, p.created_at
    FROM public.profiles p
    ORDER BY p.created_at DESC;
END;
$$;

-- 2.2 Demote live sessions
CREATE OR REPLACE FUNCTION public.developer_demote_live_sessions(
    dev_passkey text,
    target_session_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    updated_count integer := 0;
BEGIN
    -- dev_passkey is ignored; retained only for signature compatibility.
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    IF target_session_ids IS NULL OR array_length(target_session_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    UPDATE public.sessions
    SET status = 'draft',
        expires_at = NULL,
        current_question_id = NULL
    WHERE id = ANY(target_session_ids)
      AND status = 'live';

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;

-- 2.3 Login logs
CREATE OR REPLACE FUNCTION public.get_developer_login_logs(
    dev_passkey text DEFAULT NULL,
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    user_id text,
    role text,
    email text,
    login_time timestamptz,
    logout_time timestamptz,
    session_duration text,
    browser text,
    device text,
    operating_system text,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    safe_limit integer;
BEGIN
    -- dev_passkey is ignored; retained only for signature compatibility.
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    safe_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

    -- Explicit casts keep the declared result types even if the live columns differ
    -- (an earlier migration created session_duration as integer).
    RETURN QUERY
    SELECT
        l.id,
        l.user_id::text,
        l.role::text,
        l.email::text,
        l.login_time,
        l.logout_time,
        l.session_duration::text,
        l.browser::text,
        l.device::text,
        l.operating_system::text,
        l.status::text
    FROM public.login_logs l
    ORDER BY l.login_time DESC
    LIMIT safe_limit;
END;
$$;

-- 2.4 WAF aggregate metrics
CREATE OR REPLACE FUNCTION public.get_developer_waf_stats(dev_passkey text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total bigint := 0;
    v_allowed bigint := 0;
    v_blocked bigint := 0;
    v_rate_limited bigint := 0;
BEGIN
    -- dev_passkey is ignored; retained only for signature compatibility.
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    SELECT
        COALESCE(SUM(total_packets), 0),
        COALESCE(SUM(allowed_traffic), 0),
        COALESCE(SUM(threats_blocked), 0),
        COALESCE(SUM(rate_limits_throttled), 0)
    INTO v_total, v_allowed, v_blocked, v_rate_limited
    FROM public.waf_metrics;

    RETURN jsonb_build_object(
        'total', v_total,
        'allowed', v_allowed,
        'blocked', v_blocked,
        'rateLimited', v_rate_limited
    );
END;
$$;

-- 2.5 WAF incident stream
CREATE OR REPLACE FUNCTION public.get_developer_waf_logs(
    dev_passkey text DEFAULT NULL,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    log_timestamp timestamptz,
    ip_hash text,
    path text,
    method text,
    action text,
    score integer,
    rules text[],
    incident_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- dev_passkey is ignored; retained only for signature compatibility.
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        l.id,
        l.timestamp,
        l.ip_hash,
        l.path,
        COALESCE(l.details->>'method', l.user_agent, 'GET') AS method,
        l.action,
        l.risk_score AS score,
        ARRAY(
            SELECT jsonb_array_elements_text(
                CASE
                    WHEN jsonb_typeof(l.details->'rules') = 'array' THEN l.details->'rules'
                    ELSE '[]'::jsonb
                END
            )
        ) AS rules,
        COALESCE(l.details->>'incidentId', 'N/A') AS incident_id
    FROM public.waf_security_logs l
    ORDER BY l.timestamp DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$;

-- 2.6 Contact messages: read
CREATE OR REPLACE FUNCTION public.get_developer_contact_messages(
    dev_passkey text DEFAULT NULL,
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    name text,
    email text,
    subject text,
    message text,
    user_id text,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    safe_limit integer;
BEGIN
    -- dev_passkey is ignored; retained only for signature compatibility.
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    safe_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

    RETURN QUERY
    SELECT
        cm.id,
        cm.created_at,
        cm.name,
        cm.email,
        cm.subject,
        cm.message,
        cm.user_id,
        cm.status
    FROM public.contact_messages cm
    ORDER BY cm.created_at DESC
    LIMIT safe_limit;
END;
$$;

-- 2.7 Contact messages: delete
CREATE OR REPLACE FUNCTION public.developer_delete_contact_message(
    dev_passkey text DEFAULT NULL,
    target_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- dev_passkey is ignored; retained only for signature compatibility.
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    IF target_id IS NULL THEN
        RAISE EXCEPTION 'Target message ID is required';
    END IF;

    DELETE FROM public.contact_messages
    WHERE id = target_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count > 0;
END;
$$;

-- 2.8 Contact messages: update status
CREATE OR REPLACE FUNCTION public.developer_update_contact_message_status(
    dev_passkey text DEFAULT NULL,
    target_id uuid DEFAULT NULL,
    new_status text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    updated_count integer;
BEGIN
    -- dev_passkey is ignored; retained only for signature compatibility.
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    IF target_id IS NULL THEN
        RAISE EXCEPTION 'Target message ID is required';
    END IF;

    IF new_status IS NULL OR new_status NOT IN ('unread', 'read', 'archived') THEN
        RAISE EXCEPTION 'Invalid status. Permitted values: unread, read, archived';
    END IF;

    UPDATE public.contact_messages
    SET status = new_status
    WHERE id = target_id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count > 0;
END;
$$;

-- 2.9 Developer access logs: read
CREATE OR REPLACE FUNCTION public.get_developer_access_logs(
    dev_passkey text DEFAULT NULL,
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    attempted_at timestamptz,
    user_agent text,
    client_environment text,
    ip_address text,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    safe_limit integer;
BEGIN
    -- dev_passkey is ignored; retained only for signature compatibility.
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    safe_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

    RETURN QUERY
    SELECT l.id, l.attempted_at, l.user_agent, l.client_environment, l.ip_address, l.status
    FROM public.developer_access_logs l
    ORDER BY l.attempted_at DESC
    LIMIT safe_limit;
END;
$$;

-- 2.10 Developer access logs: clear
CREATE OR REPLACE FUNCTION public.clear_developer_access_logs(dev_passkey text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- dev_passkey is ignored; retained only for signature compatibility.
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.developer_access_logs;
    RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Privileges: authenticated callers only (the functions check admin themselves)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_developer_faculty_profiles(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.developer_demote_live_sessions(text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_developer_login_logs(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_developer_waf_stats(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_developer_waf_logs(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_developer_contact_messages(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.developer_delete_contact_message(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.developer_update_contact_message_status(text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_developer_access_logs(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_developer_access_logs(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_developer_faculty_profiles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.developer_demote_live_sessions(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_login_logs(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_waf_stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_waf_logs(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_contact_messages(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.developer_delete_contact_message(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.developer_update_contact_message_status(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_access_logs(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_developer_access_logs(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Postconditions: abort (and roll back) unless the passkey is fully retired
-- ─────────────────────────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
    remaining text;
    sig text;
    fn regprocedure;
    expected text[] := ARRAY[
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
    ];
BEGIN
    -- No function body in public may still verify a passkey.
    SELECT string_agg(p.oid::regprocedure::text, ', ')
      INTO remaining
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.prosrc ILIKE '%digest(dev_passkey%' OR p.prosrc ILIKE '%valid_pass_hash%');
    IF remaining IS NOT NULL THEN
        RAISE EXCEPTION 'Postcondition failed: passkey verification still present in: %', remaining;
    END IF;

    FOREACH sig IN ARRAY expected LOOP
        fn := to_regprocedure(sig);
        IF has_function_privilege('anon', fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'Postcondition failed: anon can still execute %', sig;
        END IF;
        IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'Postcondition failed: authenticated cannot execute %', sig;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_proc p
             WHERE p.oid = fn
               AND p.prosecdef
               AND p.proconfig IS NOT NULL
               AND 'search_path=public, pg_temp' = ANY (p.proconfig)
               AND p.prosrc ILIKE '%is_platform_admin()%'
        ) THEN
            RAISE EXCEPTION 'Postcondition failed: % is not an admin-gated SECURITY DEFINER with pinned search_path', sig;
        END IF;
    END LOOP;

    IF has_function_privilege('anon', 'public.is_platform_admin()'::regprocedure, 'EXECUTE') THEN
        RAISE EXCEPTION 'Postcondition failed: anon can execute public.is_platform_admin()';
    END IF;
END
$postcondition$;

NOTIFY pgrst, 'reload schema';

COMMIT;
