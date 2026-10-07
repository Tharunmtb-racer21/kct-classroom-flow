-- Migration: 20261007223000_create_waf_metrics_and_ingest_rpc.sql
-- Description: Implement production KCT SHIELD WAF telemetry storage, hourly metrics, secure ingestion RPC, and developer access RPCs.

-- 1. Table for secure private WAF configuration hashes
CREATE TABLE IF NOT EXISTS public.waf_config (
  key TEXT PRIMARY KEY,
  value_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.waf_config ENABLE ROW LEVEL SECURITY;
-- Note: No RLS policies are created on waf_config to prevent direct access via REST/client.
-- Only SECURITY DEFINER functions can read this table.

-- Seed initial SHA-256 digest of the designated WAF_INGEST_SECRET
INSERT INTO public.waf_config (key, value_hash)
VALUES ('ingest_secret_hash', 'dac14237fbd990638907c24db3d49f9d6a1a682533ff93b11346af51ebb507c6')
ON CONFLICT (key) DO UPDATE SET value_hash = EXCLUDED.value_hash, updated_at = now();

-- 2. Table for time-bucketed hourly WAF metrics
CREATE TABLE IF NOT EXISTS public.waf_metrics (
  bucket_hour TIMESTAMPTZ PRIMARY KEY,
  total_packets BIGINT NOT NULL DEFAULT 0,
  allowed_traffic BIGINT NOT NULL DEFAULT 0,
  threats_blocked BIGINT NOT NULL DEFAULT 0,
  rate_limits_throttled BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waf_metrics_bucket ON public.waf_metrics(bucket_hour DESC);

ALTER TABLE public.waf_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read waf_metrics" ON public.waf_metrics;
CREATE POLICY "Allow authenticated read waf_metrics"
  ON public.waf_metrics FOR SELECT
  TO authenticated
  USING (true);

-- 3. Ensure waf_security_logs exists and harden access
CREATE TABLE IF NOT EXISTS public.waf_security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  risk_score INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL CHECK (action IN ('ALLOW', 'MONITOR', 'BLOCK', 'RATE_LIMIT')),
  path TEXT NOT NULL,
  reason TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_waf_security_logs_timestamp ON public.waf_security_logs(timestamp DESC);

ALTER TABLE public.waf_security_logs ENABLE ROW LEVEL SECURITY;

-- Remove unauthenticated direct INSERT access (writes must go through record_waf_event RPC)
DROP POLICY IF EXISTS "Allow anon & auth insert waf_security_logs" ON public.waf_security_logs;

-- Ensure SELECT policy exists for authenticated users
DROP POLICY IF EXISTS "Allow authenticated read waf_security_logs" ON public.waf_security_logs;
CREATE POLICY "Allow authenticated read waf_security_logs"
  ON public.waf_security_logs FOR SELECT
  TO authenticated
  USING (true);

-- 4. Ingestion RPC: record_waf_event
CREATE OR REPLACE FUNCTION public.record_waf_event(
  p_secret text,
  p_action text,
  p_score integer,
  p_rules text[],
  p_path text,
  p_method text,
  p_ip_hash text,
  p_incident_id text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_expected_hash text;
  v_input_hash text;
  v_bucket timestamptz := date_trunc('hour', now());
  v_safe_action text;
  v_safe_score integer;
  v_safe_path text;
  v_safe_method text;
BEGIN
  -- A. Validate Secret Digest
  IF p_secret IS NULL OR p_secret = '' THEN
    RAISE EXCEPTION 'Unauthorized: missing WAF ingest secret';
  END IF;

  v_input_hash := encode(digest(p_secret, 'sha256'), 'hex');

  SELECT value_hash INTO v_expected_hash
  FROM public.waf_config
  WHERE key = 'ingest_secret_hash';

  IF v_expected_hash IS NULL OR v_input_hash <> v_expected_hash THEN
    RAISE EXCEPTION 'Unauthorized: invalid WAF ingest secret';
  END IF;

  -- B. Validate & Normalize Action
  v_safe_action := upper(trim(COALESCE(p_action, '')));
  IF v_safe_action NOT IN ('ALLOW', 'BLOCK', 'RATE_LIMIT', 'MONITOR') THEN
    RAISE EXCEPTION 'Invalid WAF action: %', p_action;
  END IF;

  -- C. Validate & Clamp Threat Score (0–100)
  v_safe_score := GREATEST(0, LEAST(100, COALESCE(p_score, 0)));

  -- D. Sanitize Path & Method
  v_safe_path := substring(trim(COALESCE(p_path, '/')) from 1 for 512);
  v_safe_method := upper(substring(trim(COALESCE(p_method, 'GET')) from 1 for 16));

  -- E. Atomically Upsert waf_metrics Hourly Bucket
  INSERT INTO public.waf_metrics (
    bucket_hour,
    total_packets,
    allowed_traffic,
    threats_blocked,
    rate_limits_throttled,
    updated_at
  )
  VALUES (
    v_bucket,
    1,
    CASE WHEN v_safe_action = 'ALLOW' THEN 1 ELSE 0 END,
    CASE WHEN v_safe_action = 'BLOCK' THEN 1 ELSE 0 END,
    CASE WHEN v_safe_action = 'RATE_LIMIT' THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (bucket_hour) DO UPDATE SET
    total_packets = public.waf_metrics.total_packets + 1,
    allowed_traffic = public.waf_metrics.allowed_traffic + (CASE WHEN v_safe_action = 'ALLOW' THEN 1 ELSE 0 END),
    threats_blocked = public.waf_metrics.threats_blocked + (CASE WHEN v_safe_action = 'BLOCK' THEN 1 ELSE 0 END),
    rate_limits_throttled = public.waf_metrics.rate_limits_throttled + (CASE WHEN v_safe_action = 'RATE_LIMIT' THEN 1 ELSE 0 END),
    updated_at = now();

  -- F. Insert Incident Log (Only for BLOCK and RATE_LIMIT)
  IF v_safe_action IN ('BLOCK', 'RATE_LIMIT') THEN
    INSERT INTO public.waf_security_logs (
      timestamp,
      event_type,
      risk_score,
      action,
      path,
      reason,
      ip_hash,
      user_agent,
      details
    )
    VALUES (
      now(),
      v_safe_action,
      v_safe_score,
      v_safe_action,
      v_safe_path,
      CASE
        WHEN v_safe_action = 'RATE_LIMIT' THEN 'Temporary IP burst throttled'
        WHEN array_length(p_rules, 1) > 0 THEN array_to_string(p_rules, ', ')
        ELSE 'Security rule triggered'
      END,
      COALESCE(p_ip_hash, 'anonymous'),
      v_safe_method,
      jsonb_build_object(
        'incidentId', COALESCE(p_incident_id, 'INC-ANON'),
        'rules', COALESCE(p_rules, ARRAY[]::text[]),
        'method', v_safe_method,
        'metadata', COALESCE(p_details, '{}'::jsonb)
      )
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_waf_event(text, text, integer, text[], text, text, text, text, jsonb) TO anon, authenticated;

-- 5. Developer Portal Query RPCs

-- A. Aggregated WAF Metrics
CREATE OR REPLACE FUNCTION public.get_developer_waf_stats(dev_passkey text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_valid_pass_hash text := '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7';
  v_total bigint := 0;
  v_allowed bigint := 0;
  v_blocked bigint := 0;
  v_rate_limited bigint := 0;
BEGIN
  -- Authenticate: Must be authenticated admin OR provide valid dev_passkey
  IF NOT (
    public.has_role(public.auth_uid(), 'admin')
    OR (dev_passkey IS NOT NULL AND dev_passkey <> '' AND encode(digest(dev_passkey, 'sha256'), 'hex') = v_valid_pass_hash)
  ) THEN
    RAISE EXCEPTION 'Access denied: unauthorized developer request';
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

GRANT EXECUTE ON FUNCTION public.get_developer_waf_stats(text) TO anon, authenticated;

-- B. Security Incident Stream
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
SET search_path = public, extensions
AS $$
DECLARE
  v_valid_pass_hash text := '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7';
BEGIN
  IF NOT (
    public.has_role(public.auth_uid(), 'admin')
    OR (dev_passkey IS NOT NULL AND dev_passkey <> '' AND encode(digest(dev_passkey, 'sha256'), 'hex') = v_valid_pass_hash)
  ) THEN
    RAISE EXCEPTION 'Access denied: unauthorized developer request';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.timestamp,
    l.ip_hash,
    l.path,
    COALESCE(l.details->>'method', l.user_agent, 'GET') as method,
    l.action,
    l.risk_score as score,
    ARRAY(
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(l.details->'rules') = 'array' THEN l.details->'rules'
          ELSE '[]'::jsonb
        END
      )
    ) as rules,
    COALESCE(l.details->>'incidentId', 'N/A') as incident_id
  FROM public.waf_security_logs l
  ORDER BY l.timestamp DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_waf_logs(text, integer) TO anon, authenticated;
