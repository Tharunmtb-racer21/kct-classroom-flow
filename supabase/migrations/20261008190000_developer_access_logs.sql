-- Migration: 20261008190000_developer_access_logs.sql
-- Description: Centralized, bounded, non-blocking developer access attempt telemetry with
--              server-side SHA-256 passkey verification, PostgreSQL advisory lock rate limiting,
--              and zero password retention.

-- 1. Table: developer_access_logs
CREATE TABLE IF NOT EXISTS public.developer_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_agent TEXT,
    client_environment TEXT,
    ip_address TEXT,
    status TEXT NOT NULL DEFAULT 'failed'
);

-- Indexes for fast ordering and rate-limiting lookups
CREATE INDEX IF NOT EXISTS idx_dev_access_logs_attempted_at
    ON public.developer_access_logs (attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_dev_access_logs_ip_rate
    ON public.developer_access_logs (ip_address, attempted_at DESC);

-- Enable RLS & lock down direct table access
ALTER TABLE public.developer_access_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.developer_access_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.developer_access_logs TO service_role;


-- 2. Ingest RPC: record_developer_failed_attempt
CREATE OR REPLACE FUNCTION public.record_developer_failed_attempt(
    client_env text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    req_headers json;
    extracted_ip text := 'unknown';
    extracted_ua text := 'unknown';
    recent_ip_count integer := 0;
    recent_global_count integer := 0;
BEGIN
    -- Safely extract request headers from gateway without failing in offline/direct contexts
    BEGIN
        req_headers := current_setting('request.headers', true)::json;
        IF req_headers IS NOT NULL THEN
            extracted_ip := COALESCE(
                nullif(req_headers->>'cf-connecting-ip', ''),
                nullif(req_headers->>'x-real-ip', ''),
                nullif(split_part(req_headers->>'x-forwarded-for', ',', 1), ''),
                'unknown'
            );
            extracted_ua := COALESCE(nullif(req_headers->>'user-agent', ''), client_env, 'unknown');
        ELSE
            extracted_ua := COALESCE(client_env, 'unknown');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        extracted_ip := 'unknown';
        extracted_ua := COALESCE(client_env, 'unknown');
    END;

    -- Concurrency-Safe Rate Limiting via PostgreSQL Transaction Advisory Locks
    -- Consistent lock ordering: Global lock first, then per-IP lock
    PERFORM pg_advisory_xact_lock(hashtext('dev_access_global_rate_limit'));

    SELECT COUNT(*) INTO recent_global_count
    FROM public.developer_access_logs
    WHERE attempted_at > (now() - interval '1 minute');

    IF recent_global_count >= 30 THEN
        RETURN false; -- Silent discard global flood
    END IF;

    IF extracted_ip <> 'unknown' THEN
        PERFORM pg_advisory_xact_lock(hashtext('dev_access_ip_' || extracted_ip));

        SELECT COUNT(*) INTO recent_ip_count
        FROM public.developer_access_logs
        WHERE ip_address = extracted_ip
          AND attempted_at > (now() - interval '1 minute');

        IF recent_ip_count >= 5 THEN
            RETURN false; -- Silent discard per-IP burst
        END IF;
    END IF;

    -- Insert telemetry row (zero password fields)
    INSERT INTO public.developer_access_logs (
        attempted_at,
        user_agent,
        client_environment,
        ip_address,
        status
    ) VALUES (
        now(),
        LEFT(extracted_ua, 255),
        LEFT(COALESCE(client_env, 'Web Client'), 64),
        LEFT(extracted_ip, 64),
        'failed'
    );

    -- Bounded Retention Maintenance (Keep max 500 rows, evict > 30 days)
    DELETE FROM public.developer_access_logs
    WHERE attempted_at < (now() - interval '30 days');

    DELETE FROM public.developer_access_logs
    WHERE id IN (
        SELECT id FROM public.developer_access_logs
        ORDER BY attempted_at DESC
        OFFSET 500
    );

    RETURN true;
END;
$$;


-- 3. Read RPC: get_developer_access_logs
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
SET search_path = public, extensions
AS $$
DECLARE
    safe_limit integer;
    valid_pass_hash text := '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7';
BEGIN
    -- Validates admin database role OR server-side SHA-256 hashed plaintext passkey
    -- Raw stored hash is NEVER accepted as a password
    IF NOT (
        public.has_role(public.auth_uid(), 'admin')
        OR (dev_passkey IS NOT NULL AND dev_passkey <> '' AND encode(digest(dev_passkey, 'sha256'), 'hex') = valid_pass_hash)
    ) THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request';
    END IF;

    safe_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

    RETURN QUERY
    SELECT l.id, l.attempted_at, l.user_agent, l.client_environment, l.ip_address, l.status
    FROM public.developer_access_logs l
    ORDER BY l.attempted_at DESC
    LIMIT safe_limit;
END;
$$;


-- 4. Clear RPC: clear_developer_access_logs
CREATE OR REPLACE FUNCTION public.clear_developer_access_logs(
    dev_passkey text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    valid_pass_hash text := '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7';
BEGIN
    IF NOT (
        public.has_role(public.auth_uid(), 'admin')
        OR (dev_passkey IS NOT NULL AND dev_passkey <> '' AND encode(digest(dev_passkey, 'sha256'), 'hex') = valid_pass_hash)
    ) THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request';
    END IF;

    DELETE FROM public.developer_access_logs;
    RETURN true;
END;
$$;


-- 5. Explicit Function Privileges (Revoke from PUBLIC, grant to anon/authenticated)
REVOKE ALL ON FUNCTION public.record_developer_failed_attempt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_developer_failed_attempt(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_developer_access_logs(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_developer_access_logs(text, integer) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.clear_developer_access_logs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_developer_access_logs(text) TO anon, authenticated;
