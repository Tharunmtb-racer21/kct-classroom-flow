-- Add marks column to questions table if not exists, defaulting to 1
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS marks INTEGER NOT NULL DEFAULT 1;

-- If points exists, copy existing points values to marks
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'questions' 
      AND column_name = 'points'
  ) THEN
    UPDATE public.questions SET marks = COALESCE(points, 1) WHERE marks IS NULL OR marks = 1;
  END IF;
END $$;

-- Force PostgREST schema cache reload to update API cache
NOTIFY pgrst, 'reload schema';
