-- Migration: Optimize indexes for reports queries and faculty analytics
-- This ensures that querying sessions by creator_id and fetching participants, questions, 
-- and responses by foreign keys with ordering executes in milliseconds without sequential scans.

CREATE INDEX IF NOT EXISTS idx_sessions_creator_created_at 
ON public.sessions (creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_session_order 
ON public.questions (session_id, order_index ASC);

CREATE INDEX IF NOT EXISTS idx_participants_session_joined 
ON public.participants (session_id, joined_at ASC);

CREATE INDEX IF NOT EXISTS idx_responses_question_created 
ON public.responses (question_id, created_at ASC);

