-- ============================================================================
-- KCT PULSE — Secondary ML Database & Telemetry Data Lake Schema
-- Target Database: enssdnjdgoyotgronelk.supabase.co
-- Execution: Run this entire script in Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. ML TRAINING DATASET (Feature Vectors for AI / ML models)
CREATE TABLE IF NOT EXISTS public.ml_training_records (
  student_id_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  total_questions INTEGER DEFAULT 0,
  attempted_questions INTEGER DEFAULT 0,
  skipped_questions INTEGER DEFAULT 0,
  quiz_accuracy_pct NUMERIC(5,2) DEFAULT 0.00,
  poll_participation_count INTEGER DEFAULT 0,
  wordcloud_participation_count INTEGER DEFAULT 0,
  avg_response_time_ms NUMERIC(10,2) DEFAULT 0.00,
  integrity_events_count INTEGER DEFAULT 0,
  fullscreen_exits_count INTEGER DEFAULT 0,
  total_blur_duration_seconds NUMERIC(10,2) DEFAULT 0.00,
  target_engagement_score NUMERIC(5,2) DEFAULT 0.00,
  target_engagement_class TEXT DEFAULT 'moderately_engaged',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id_hash, session_id)
);

-- 2. STUDENT ANALYTICS & TRENDS
CREATE TABLE IF NOT EXISTS public.ml_student_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  engagement_score INTEGER NOT NULL DEFAULT 0,
  engagement_level TEXT NOT NULL,
  accuracy_percentage NUMERIC(5,2) DEFAULT 0.00,
  questions_attempted INTEGER DEFAULT 0,
  questions_skipped INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  performance_trend TEXT DEFAULT 'insufficient_data',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_ml_participant_session UNIQUE (participant_id, session_id)
);

-- 3. TOPIC PERFORMANCE & WEAKNESS CLUSTERING
CREATE TABLE IF NOT EXISTS public.ml_topic_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  accuracy_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL,
  question_count INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  recommendation TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. RAW SESSIONS TELEMETRY MIRROR
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  creator_id TEXT,
  status TEXT DEFAULT 'ended',
  current_question_id UUID,
  is_exam BOOLEAN DEFAULT FALSE,
  max_fullscreen_exits INTEGER DEFAULT 3,
  block_clipboard BOOLEAN DEFAULT TRUE,
  block_right_click BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. RAW QUESTIONS TELEMETRY MIRROR
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT,
  order_index INTEGER DEFAULT 0,
  marks NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. RAW PARTICIPANTS TELEMETRY MIRROR
CREATE TABLE IF NOT EXISTS public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  name TEXT NOT NULL,
  risk_score FLOAT DEFAULT 0.0,
  risk_level TEXT DEFAULT 'low',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. RAW RESPONSES TELEMETRY MIRROR
CREATE TABLE IF NOT EXISTS public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL,
  participant_id UUID NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. RAW EXAM INTEGRITY EVENTS TELEMETRY MIRROR
CREATE TABLE IF NOT EXISTS public.exam_integrity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  participant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  question_id UUID,
  duration_seconds INTEGER,
  client_metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) & PUBLIC ACCESS POLICIES
-- ============================================================================

ALTER TABLE public.ml_training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_student_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_topic_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_integrity_events ENABLE ROW LEVEL SECURITY;

-- Permissive policies allowing sync and queries via publishable / anon key
CREATE POLICY "allow_all_ml_training_records" ON public.ml_training_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ml_student_analytics" ON public.ml_student_analytics FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ml_topic_performance" ON public.ml_topic_performance FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_sessions" ON public.sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_questions" ON public.questions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_participants" ON public.participants FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_responses" ON public.responses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_exam_integrity_events" ON public.exam_integrity_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Indexes for lightning fast queries & analytics
CREATE INDEX IF NOT EXISTS idx_ml_records_session ON public.ml_training_records(session_id);
CREATE INDEX IF NOT EXISTS idx_ml_records_score ON public.ml_training_records(target_engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_ml_student_analytics_session ON public.ml_student_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_ml_topic_perf_session ON public.ml_topic_performance(session_id);
CREATE INDEX IF NOT EXISTS idx_responses_question ON public.responses(question_id);
CREATE INDEX IF NOT EXISTS idx_responses_participant ON public.responses(participant_id);
CREATE INDEX IF NOT EXISTS idx_participants_session ON public.participants(session_id);
CREATE INDEX IF NOT EXISTS idx_integrity_session ON public.exam_integrity_events(session_id);
