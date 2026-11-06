-- Migration: 20261106202500_fix_clear_developer_access_logs_permissions.sql
-- Description: Grant EXECUTE to anon on clear_developer_access_logs so the Developer Portal
--              can purge access logs using the verified developer passkey or superadmin role.

-- 1. Redefine clear_developer_access_logs with support for dev_passkey and platform admin
CREATE OR REPLACE FUNCTION public.clear_developer_access_logs(
    dev_passkey text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    valid_pass_hash text := '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7';
BEGIN
    -- Allow execution if caller is verified platform admin OR provided the valid developer passkey
    IF NOT (
        public.is_platform_admin()
        OR public.has_role(public.auth_uid(), 'admin'::public.app_role)
        OR (dev_passkey IS NOT NULL AND dev_passkey <> '' AND encode(digest(dev_passkey, 'sha256'), 'hex') = valid_pass_hash)
    ) THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request' USING ERRCODE = '42501';
    END IF;

    -- Include explicit WHERE clause on primary key to satisfy pg-safeupdate
    DELETE FROM public.developer_access_logs
    WHERE id IS NOT NULL;

    RETURN true;
END;
$$;

-- 2. Explicit Function Privileges: Grant to anon and authenticated
REVOKE ALL ON FUNCTION public.clear_developer_access_logs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_developer_access_logs(text) TO anon, authenticated, service_role;

-- 3. Update is_platform_admin to recognize both 25it and 23cs institutional developer emails
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
    BEGIN
        v_uid := public.auth_uid();
    EXCEPTION WHEN others THEN
        RETURN false;
    END;

    IF v_uid IS NOT NULL AND v_uid <> '' THEN
        IF public.has_role(v_uid, 'admin'::public.app_role) THEN
            RETURN true;
        END IF;
    END IF;

    -- Check JWT claims for verified institutional email
    BEGIN
        v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    EXCEPTION WHEN others THEN
        RETURN false;
    END;

    IF v_claims IS NOT NULL THEN
        v_email := lower(btrim(coalesce(v_claims ->> 'email', '')));
        IF v_email IN (
            'navneeth.25it@kct.ac.in',
            'navneeth.23cs@kct.ac.in',
            'tharun.25it@kct.ac.in',
            'tharun.23cs@kct.ac.in'
        ) THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated, service_role;

-- 4. Bootstrap admin role for current superadmin accounts in user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role
FROM public.profiles p
WHERE lower(p.email) IN (
    'navneeth.25it@kct.ac.in',
    'navneeth.23cs@kct.ac.in',
    'tharun.25it@kct.ac.in',
    'tharun.23cs@kct.ac.in'
)
ON CONFLICT (user_id, role) DO NOTHING;

