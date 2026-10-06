-- Migration: 20261006140000_create_login_logs_and_rpc.sql
-- Description: Create public.login_logs table, strict RLS policies for Firebase users, and secure developer RPC for Developer Portal.

-- 1. Create table public.login_logs
CREATE TABLE IF NOT EXISTS public.login_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'faculty',
    email TEXT,
    login_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    logout_time TIMESTAMPTZ,
    session_duration TEXT,
    browser TEXT,
    device TEXT,
    operating_system TEXT,
    ip_address TEXT,
    country TEXT,
    city TEXT,
    status TEXT DEFAULT 'active'
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_login_logs_login_time ON public.login_logs (login_time DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs (user_id);

-- 3. Enable RLS
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies:
-- INSERT: Authenticated user may insert only a row matching their authenticated Firebase UID
CREATE POLICY "Users can insert own login logs"
    ON public.login_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()::text
        OR user_id = public.auth_uid()
    );

-- UPDATE: Authenticated user may update only their own active login record
CREATE POLICY "Users can update own login logs"
    ON public.login_logs
    FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid()::text
        OR user_id = public.auth_uid()
    )
    WITH CHECK (
        user_id = auth.uid()::text
        OR user_id = public.auth_uid()
    );

-- SELECT: Authenticated user may only read their own login history
CREATE POLICY "Users can view own login logs"
    ON public.login_logs
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()::text
        OR user_id = public.auth_uid()
    );

-- Grant standard permissions to authenticated role (no direct SELECT/INSERT/UPDATE for anon)
GRANT SELECT, INSERT, UPDATE ON TABLE public.login_logs TO authenticated;

-- 5. Developer Telemetry RPC
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
SET search_path = public, extensions
AS $$
DECLARE
    safe_limit integer;
    valid_pass_hash text := '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7';
BEGIN
    -- 1. Check if caller is authenticated as an admin in user_roles OR has valid hashed passkey
    IF NOT (
        public.has_role(public.auth_uid(), 'admin')
        OR (dev_passkey IS NOT NULL AND dev_passkey <> '' AND encode(digest(dev_passkey, 'sha256'), 'hex') = valid_pass_hash)
    ) THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request';
    END IF;

    -- 2. Enforce safe limit bounds (1 to 500, default 100)
    safe_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

    -- 3. Return sanitized telemetry fields ordered by login_time DESC
    RETURN QUERY
    SELECT
        l.id,
        l.user_id,
        l.role,
        l.email,
        l.login_time,
        l.logout_time,
        l.session_duration,
        l.browser,
        l.device,
        l.operating_system,
        l.status
    FROM public.login_logs l
    ORDER BY l.login_time DESC
    LIMIT safe_limit;
END;
$$;

-- Grant execution to authenticated and anon users (RPC handles authorization internally)
GRANT EXECUTE ON FUNCTION public.get_developer_login_logs(text, integer) TO authenticated, anon;
