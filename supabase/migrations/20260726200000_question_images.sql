-- Add image_url column to questions (idempotent)
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create Storage bucket for question images (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies on the Storage bucket (idempotent)
DROP POLICY IF EXISTS "Anyone can view question images" ON storage.objects;
CREATE POLICY "Anyone can view question images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'question-images');

DROP POLICY IF EXISTS "Faculty can upload question images" ON storage.objects;
CREATE POLICY "Faculty can upload question images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'question-images' 
    AND (storage.foldername(name))[1] = public.auth_uid()
  );
