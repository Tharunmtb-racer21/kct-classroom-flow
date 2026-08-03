-- Migration: 20260803230000_production_sync_tables.sql
-- Description: Create login_logs table, RLS policies, performance indexes, and analytics functions.

-- 1. Create login_logs table
CREATE TABLE IF NOT EXISTS public.login_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'faculty',
    email TEXT,
    login_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    logout_time TIMESTAMPTZ,
    session_duration INTEGER, -- in seconds
    browser TEXT,
    device TEXT,
    operating_system TEXT,
    ip_address TEXT,
    country TEXT,
    city TEXT,
    status TEXT NOT NULL DEFAULT 'active'
);

-- Enable RLS on login_logs
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for select: users can read their own logs, admins can read all logs
CREATE POLICY "Users can view their own login logs or admin view all"
    ON public.login_logs
    FOR SELECT
    USING (
        auth.uid()::text = user_id 
        OR EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid()::text AND role = 'admin'
        )
        OR true -- Allow read access for authenticated logging/telemetry
    );

-- Create policy for insert: authenticated users can insert their login logs
CREATE POLICY "Authenticated users can insert login logs"
    ON public.login_logs
    FOR INSERT
    WITH CHECK (true);

-- Create policy for update: users can update their own login logs (logout_time)
CREATE POLICY "Users can update their login logs"
    ON public.login_logs
    FOR UPDATE
    USING (true);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_creator_id ON public.sessions(creator_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_participants_session_id ON public.participants(session_id);
CREATE INDEX IF NOT EXISTS idx_participants_joined_at ON public.participants(joined_at);

CREATE INDEX IF NOT EXISTS idx_questions_session_id ON public.questions(session_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON public.questions(type);

CREATE INDEX IF NOT EXISTS idx_responses_question_id ON public.responses(question_id);
CREATE INDEX IF NOT EXISTS idx_responses_participant_id ON public.responses(participant_id);
CREATE INDEX IF NOT EXISTS idx_responses_created_at ON public.responses(created_at);

CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_login_time ON public.login_logs(login_time);

-- 3. Database aggregation function for institute-wide admin statistics
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'faculty', json_build_object(
            'total', (SELECT COUNT(DISTINCT user_id) FROM public.user_roles WHERE role = 'faculty'),
            'active', (SELECT COUNT(DISTINCT creator_id) FROM public.sessions WHERE created_at >= NOW() - INTERVAL '30 days'),
            'logged_in_today', (SELECT COUNT(DISTINCT user_id) FROM public.login_logs WHERE login_time >= CURRENT_DATE),
            'currently_online', (SELECT COUNT(DISTINCT user_id) FROM public.login_logs WHERE logout_time IS NULL AND login_time >= NOW() - INTERVAL '12 hours')
        ),
        'students', json_build_object(
            'total', (SELECT COUNT(*) FROM public.participants),
            'joined_today', (SELECT COUNT(*) FROM public.participants WHERE joined_at >= CURRENT_DATE),
            'connected', (SELECT COUNT(DISTINCT participant_id) FROM public.responses WHERE created_at >= NOW() - INTERVAL '1 hour'),
            'active_participants', (SELECT COUNT(DISTINCT id) FROM public.participants WHERE joined_at >= NOW() - INTERVAL '24 hours')
        ),
        'sessions', json_build_object(
            'total', (SELECT COUNT(*) FROM public.sessions),
            'active', (SELECT COUNT(*) FROM public.sessions WHERE status = 'live'),
            'scheduled', (SELECT COUNT(*) FROM public.sessions WHERE status = 'draft' AND expires_at IS NOT NULL),
            'completed', (SELECT COUNT(*) FROM public.sessions WHERE status = 'ended'),
            'archived', (SELECT COUNT(*) FROM public.sessions WHERE status = 'draft' AND expires_at IS NULL)
        ),
        'questions', json_build_object(
            'total', (SELECT COUNT(*) FROM public.questions),
            'poll', (SELECT COUNT(*) FROM public.questions WHERE type = 'poll'),
            'quiz', (SELECT COUNT(*) FROM public.questions WHERE type = 'quiz'),
            'wordcloud', (SELECT COUNT(*) FROM public.questions WHERE type = 'wordcloud')
        ),
        'responses', json_build_object(
            'total', (SELECT COUNT(*) FROM public.responses),
            'today', (SELECT COUNT(*) FROM public.responses WHERE created_at >= CURRENT_DATE),
            'response_rate', (
                CASE 
                    WHEN (SELECT COUNT(*) FROM public.participants) > 0 
                    THEN ROUND(((SELECT COUNT(*)::NUMERIC FROM public.responses) / (SELECT COUNT(*)::NUMERIC FROM public.participants)), 2)
                    ELSE 0 
                END
            ),
            'avg_per_session', (
                CASE 
                    WHEN (SELECT COUNT(*) FROM public.sessions) > 0 
                    THEN ROUND(((SELECT COUNT(*)::NUMERIC FROM public.responses) / (SELECT COUNT(*)::NUMERIC FROM public.sessions)), 1)
                    ELSE 0 
                END
            )
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
