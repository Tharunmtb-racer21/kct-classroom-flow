-- Migration: 20261007230000_rotate_waf_ingest_secret.sql
-- Description: Rotate WAF_INGEST_SECRET to a fresh cryptographically secure secret digest.

UPDATE public.waf_config
SET value_hash = 'dac14237fbd990638907c24db3d49f9d6a1a682533ff93b11346af51ebb507c6', updated_at = now()
WHERE key = 'ingest_secret_hash';
