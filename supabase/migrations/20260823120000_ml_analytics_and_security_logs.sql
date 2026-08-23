-- Migration: ML Analytics & WAF Security Logs
-- Created: 2026-08-23

-- 1. Table for tracking individual student engagement scores and trends
CREATE TABLE IF NOT EXISTS public.ml_student_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  engagement_score INTEGER NOT NULL DEFAULT 0,
  engagement_level TEXT NOT NULL CHECK (engagement_level IN ('highly_engaged', 'moderately_engaged', 'needs_attention')),
  accuracy_percentage NUMERIC(5,2) DEFAULT 0.00,
  questions_attempted INTEGER DEFAULT 0,
  questions_skipped INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  performance_trend TEXT DEFAULT 'insufficient_data' CHECK (performance_trend IN ('improving', 'stable', 'declining', 'insufficient_data')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_participant_session UNIQUE (participant_id, session_id)
);

-- 2. Table for tracking topic performance metrics and faculty recommendations
CREATE TABLE IF NOT EXISTS public.ml_topic_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  topic_name TEXT NOT NULL,
  accuracy_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL CHECK (status IN ('good', 'moderate', 'weak')),
  question_count INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  recommendation TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Table for WAF security telemetry and anomaly risk logs
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

-- Enable RLS on newly created tables
ALTER TABLE public.ml_student_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_topic_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waf_security_logs ENABLE ROW LEVEL SECURITY;

-- Allow read/write for authenticated users (faculty)
CREATE POLICY "Allow authenticated read ml_student_analytics"
  ON public.ml_student_analytics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated write ml_student_analytics"
  ON public.ml_student_analytics FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read ml_topic_performance"
  ON public.ml_topic_performance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated write ml_topic_performance"
  ON public.ml_topic_performance FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read waf_security_logs"
  ON public.waf_security_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon & auth insert waf_security_logs"
  ON public.waf_security_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Indexes for fast dashboard query performance
CREATE INDEX IF NOT EXISTS idx_ml_student_analytics_session ON public.ml_student_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_ml_topic_performance_session ON public.ml_topic_performance(session_id);
CREATE INDEX IF NOT EXISTS idx_waf_security_logs_timestamp ON public.waf_security_logs(timestamp DESC);
