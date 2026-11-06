-- Migration: 20261106120000_fix_clear_developer_access_logs_safeupdate.sql
-- Description: Fix clear_developer_access_logs to include a WHERE clause (WHERE id IS NOT NULL)
--              to satisfy PostgreSQL safeupdate / pg-safeupdate extension guards in production Supabase.

CREATE OR REPLACE FUNCTION public.clear_developer_access_logs(
    dev_passkey text DEFAULT NULL
)
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

    -- Include explicit WHERE clause on primary key to satisfy pg-safeupdate
    DELETE FROM public.developer_access_logs
    WHERE id IS NOT NULL;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_developer_access_logs(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_developer_access_logs(text) TO authenticated;
