-- Migration: 20261006160000_fix_login_logs_rls_auth_uid.sql
-- Description: Replace login_logs RLS policies to use public.auth_uid() exclusively.
-- auth.uid() returns uuid and fails with 22P02 on Firebase string UIDs.
-- public.auth_uid() returns text and handles Firebase alphanumeric UIDs properly.

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own login logs" ON public.login_logs;
DROP POLICY IF EXISTS "Users can update own login logs" ON public.login_logs;
DROP POLICY IF EXISTS "Users can view own login logs" ON public.login_logs;

CREATE POLICY "Users can insert own login logs"
    ON public.login_logs
    FOR INSERT
    TO public
    WITH CHECK (
        user_id = public.auth_uid()
    );

CREATE POLICY "Users can update own login logs"
    ON public.login_logs
    FOR UPDATE
    TO public
    USING (
        user_id = public.auth_uid()
    )
    WITH CHECK (
        user_id = public.auth_uid()
    );

CREATE POLICY "Users can view own login logs"
    ON public.login_logs
    FOR SELECT
    TO public
    USING (
        user_id = public.auth_uid()
    );
