-- Temporary fallback to extract Firebase UID from a custom header
-- This allows bypassing PostgREST JWT decode errors when Supabase is not configured to read Firebase JWTs.
-- The client will send the anon key + x-firebase-uid instead of the Firebase JWT.

CREATE OR REPLACE FUNCTION public.auth_uid()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true)::json->>'sub', ''),
    nullif(current_setting('request.headers', true)::json->>'x-firebase-uid', '')
  )::text;
$$;
