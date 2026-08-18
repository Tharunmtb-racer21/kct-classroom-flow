-- Migration: 20260818230000_reload_schema_cache.sql
-- Description: Force Supabase API server (Postgrest) to reload its database schema cache

NOTIFY pgrst, 'reload schema';
