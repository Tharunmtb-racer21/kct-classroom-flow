-- Phase 5: Remove the insecure x-firebase-uid header fallback from auth_uid().
--
-- Previously auth_uid() read the user identity from a plain HTTP header that
-- any client could forge. Now that Supabase is configured with Firebase as a
-- Third-Party Auth provider (Dashboard -> Auth -> Third-Party Auth), it
-- cryptographically verifies every Firebase ID token via Firebase's JWKS endpoint
-- before populating request.jwt.claims. This function now trusts ONLY that
-- verified claim — the header fallback is gone entirely.
--
-- PREREQUISITE: Firebase must be added as a Third-Party Auth provider in the
-- Supabase dashboard BEFORE deploying this migration, otherwise all RLS
-- policies will break (auth_uid() will return NULL for all requests).

CREATE OR REPLACE FUNCTION public.auth_uid()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    current_setting('request.jwt.claims', true)::json->>'sub',
    ''
  );
$$;
