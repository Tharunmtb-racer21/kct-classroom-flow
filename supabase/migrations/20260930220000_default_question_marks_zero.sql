-- Set default marks and points for newly created questions to 0
ALTER TABLE public.questions ALTER COLUMN marks SET DEFAULT 0;
ALTER TABLE public.questions ALTER COLUMN points SET DEFAULT 0;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
