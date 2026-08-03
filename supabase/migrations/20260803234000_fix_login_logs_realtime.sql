-- Migration: 20260803234000_fix_login_logs_realtime.sql
-- Description: Grant permissions on login_logs, setup policies, and enable Realtime sync.

-- Grant table permissions to authenticated and anon
GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_logs TO authenticated, anon;
GRANT ALL ON public.login_logs TO service_role;

-- Drop old restricted policies if any
DROP POLICY IF EXISTS "Users can view their own login logs or admin view all" ON public.login_logs;
DROP POLICY IF EXISTS "Authenticated users can insert login logs" ON public.login_logs;
DROP POLICY IF EXISTS "Users can update their login logs" ON public.login_logs;

-- Permissive policies for Firebase Auth + developer telemetry access
CREATE POLICY "Anyone view login_logs" ON public.login_logs FOR SELECT USING (true);
CREATE POLICY "Anyone insert login_logs" ON public.login_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone update login_logs" ON public.login_logs FOR UPDATE USING (true);

-- Add login_logs to supabase_realtime publication
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.login_logs;
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;
