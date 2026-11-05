-- Add image_url column to sessions (idempotent)
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS image_url TEXT;
