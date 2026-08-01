-- KCT PULSE Database Optimization & Cleanup Migration
-- Created: 2026-08-01

-- 1. High-Performance B-Tree Indexes on Foreign Keys & Lookups
CREATE INDEX IF NOT EXISTS idx_sessions_creator_id ON public.sessions (creator_id);
CREATE INDEX IF NOT EXISTS idx_sessions_code ON public.sessions (code);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions (status);
CREATE INDEX IF NOT EXISTS idx_questions_session_id ON public.questions (session_id);
CREATE INDEX IF NOT EXISTS idx_participants_session_id ON public.participants (session_id);
CREATE INDEX IF NOT EXISTS idx_responses_question_id ON public.responses (question_id);
CREATE INDEX IF NOT EXISTS idx_responses_participant_id ON public.responses (participant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);

-- 2. Cleanup Orphaned Records (if any stray records exist)
DELETE FROM public.responses WHERE question_id NOT IN (SELECT id FROM public.questions);
DELETE FROM public.responses WHERE participant_id NOT IN (SELECT id FROM public.participants);
DELETE FROM public.questions WHERE session_id NOT IN (SELECT id FROM public.sessions);
DELETE FROM public.participants WHERE session_id NOT IN (SELECT id FROM public.sessions);

-- 3. Optimized Function to Purge Empty Draft Sessions
CREATE OR REPLACE FUNCTION public.purge_empty_draft_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH empty_sessions AS (
    SELECT s.id
    FROM public.sessions s
    LEFT JOIN public.questions q ON q.session_id = s.id
    LEFT JOIN public.participants p ON p.session_id = s.id
    WHERE s.status = 'draft'
    GROUP BY s.id
    HAVING COUNT(q.id) = 0 AND COUNT(p.id) = 0
  )
  DELETE FROM public.sessions
  WHERE id IN (SELECT id FROM empty_sessions);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
