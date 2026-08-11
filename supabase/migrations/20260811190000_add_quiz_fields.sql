ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'Single Correct' CHECK (question_type IN ('Single Correct', 'Multiple Correct'));

-- Force PostgREST schema cache reload to update API cache
NOTIFY pgrst, 'reload schema';
