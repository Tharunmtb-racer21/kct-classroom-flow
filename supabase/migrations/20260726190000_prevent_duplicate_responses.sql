-- Prevent a participant from submitting more than one response per question.
-- This enforces fair play at the database level -- no client-side workaround can bypass it.
ALTER TABLE public.responses
  ADD CONSTRAINT responses_one_per_participant
  UNIQUE (question_id, participant_id);
