-- Add image_url column to responses table (idempotent)
ALTER TABLE public.responses ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Update Storage RLS to allow anonymous inserts (students are anonymous) (idempotent)
DROP POLICY IF EXISTS "Anyone can upload response images" ON storage.objects;
CREATE POLICY "Anyone can upload response images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'question-images');
