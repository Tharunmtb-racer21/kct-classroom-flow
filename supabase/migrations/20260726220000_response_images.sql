-- Add image_url column to responses table
ALTER TABLE public.responses ADD COLUMN image_url TEXT;

-- Update Storage RLS to allow anonymous inserts (students are anonymous)
CREATE POLICY "Anyone can upload response images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'question-images');
