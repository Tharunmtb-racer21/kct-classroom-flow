-- Add active_question_ids array column to sessions table so teachers can activate multiple chosen questions at once
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS active_question_ids TEXT[] DEFAULT '{}';
