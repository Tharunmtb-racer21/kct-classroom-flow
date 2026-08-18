-- Migration: 20260818210000_create_exam_integrity_monitoring.sql
-- Description: Add exam integrity settings to sessions, risk tracking to participants, and create monitoring tables.

-- 1. Add integrity settings to sessions table
ALTER TABLE public.sessions 
  ADD COLUMN IF NOT EXISTS is_exam BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_fullscreen_exits INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS block_clipboard BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS block_right_click BOOLEAN DEFAULT TRUE;

-- 2. Add risk metrics to participants table
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS risk_score FLOAT DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high'));

-- 3. Create exam_integrity_events table
CREATE TABLE IF NOT EXISTS public.exam_integrity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER,
  client_metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS on exam_integrity_events
ALTER TABLE public.exam_integrity_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for exam_integrity_events
CREATE POLICY "Anyone can insert integrity events" 
  ON public.exam_integrity_events 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Anyone can view integrity events" 
  ON public.exam_integrity_events 
  FOR SELECT 
  USING (true);

-- 4. Create exam_heartbeats table
CREATE TABLE IF NOT EXISTS public.exam_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  latency_ms INTEGER,
  downlink_mbps FLOAT,
  connection_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('stable', 'unstable', 'offline'))
);

-- Enable RLS on exam_heartbeats
ALTER TABLE public.exam_heartbeats ENABLE ROW LEVEL SECURITY;

-- RLS policies for exam_heartbeats
CREATE POLICY "Anyone can insert heartbeats" 
  ON public.exam_heartbeats 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Anyone can view heartbeats" 
  ON public.exam_heartbeats 
  FOR SELECT 
  USING (true);

-- 5. Performance Indexes for the new tables
CREATE INDEX IF NOT EXISTS idx_exam_integrity_events_session_id ON public.exam_integrity_events(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_integrity_events_participant_id ON public.exam_integrity_events(participant_id);
CREATE INDEX IF NOT EXISTS idx_exam_integrity_events_timestamp ON public.exam_integrity_events(timestamp);

CREATE INDEX IF NOT EXISTS idx_exam_heartbeats_session_id ON public.exam_heartbeats(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_heartbeats_participant_id ON public.exam_heartbeats(participant_id);
CREATE INDEX IF NOT EXISTS idx_exam_heartbeats_timestamp ON public.exam_heartbeats(timestamp);
