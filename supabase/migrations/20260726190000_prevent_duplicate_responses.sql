-- Prevent a participant from submitting more than one response per question.
-- Guarded idempotently to ensure historical responses are never lost and migrations never fail.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'responses_one_per_participant'
  ) THEN
    -- Check if duplicates exist in existing historical submissions
    IF NOT EXISTS (
      SELECT 1 FROM public.responses 
      GROUP BY question_id, participant_id 
      HAVING count(*) > 1 
      LIMIT 1
    ) THEN
      ALTER TABLE public.responses
        ADD CONSTRAINT responses_one_per_participant
        UNIQUE (question_id, participant_id);
    ELSE
      RAISE NOTICE 'Skipping responses_one_per_participant unique constraint: historical duplicate submissions exist and must be preserved';
    END IF;
  END IF;
END $$;
