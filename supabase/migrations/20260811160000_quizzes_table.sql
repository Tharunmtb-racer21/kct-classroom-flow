-- Migration: 20260811160000_quizzes_table.sql
-- Description: Create students, quizzes, quiz_questions, quiz_attempts, and quiz_responses tables, set up storage buckets and RLS policies.

-- 1. Create students table
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  section TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.students TO authenticated, anon;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create or view students" ON public.students FOR ALL USING (true) WITH CHECK (true);

-- 2. Create quizzes table
CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  time_limit_minutes INT,
  shuffle_questions BOOLEAN NOT NULL DEFAULT false,
  shuffle_answers BOOLEAN NOT NULL DEFAULT false,
  max_attempts INT NOT NULL DEFAULT 1,
  pass_mark NUMERIC,
  target_audience TEXT NOT NULL, -- e.g. "CSE-A"
  source TEXT NOT NULL CHECK (source IN ('manual', 'excel_upload')),
  source_file_url TEXT, -- private storage path
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated, anon;
GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view quizzes" ON public.quizzes FOR SELECT USING (true);
CREATE POLICY "Teachers can manage own quizzes" ON public.quizzes FOR ALL 
  USING (public.auth_uid() = created_by) WITH CHECK (public.auth_uid() = created_by);

-- 3. Create quiz_questions table
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_no INT NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT,
  option_d TEXT,
  option_e TEXT,
  correct_answer TEXT NOT NULL, -- e.g. "B" or "A,C"
  question_type TEXT NOT NULL CHECK (question_type IN ('Single Correct', 'Multiple Correct')),
  points NUMERIC NOT NULL DEFAULT 1,
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated, anon;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view quiz questions" ON public.quiz_questions FOR SELECT USING (true);
CREATE POLICY "Teachers can manage own quiz questions" ON public.quiz_questions FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.created_by = public.auth_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.created_by = public.auth_uid()));

-- 4. Create quiz_attempts table
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  question_order JSONB, -- JSON array of question IDs
  option_order JSONB,   -- JSON object mapping question_id -> array of option letters (e.g., ["B", "A", "C", "D"])
  score NUMERIC,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO authenticated, anon;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create or view quiz attempts" ON public.quiz_attempts FOR ALL USING (true) WITH CHECK (true);

-- 5. Create quiz_responses table
CREATE TABLE IF NOT EXISTS public.quiz_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  selected_answer TEXT, -- e.g. "B" or "A,C"
  is_correct BOOLEAN,
  points_awarded NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_responses TO authenticated, anon;
GRANT ALL ON public.quiz_responses TO service_role;
ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create or view quiz responses" ON public.quiz_responses FOR ALL USING (true) WITH CHECK (true);

-- 6. Create Storage Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('quiz-templates', 'quiz-templates', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('quiz-uploads', 'quiz-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- 7. Set up RLS policies on the Storage buckets
CREATE POLICY "Anyone can view quiz templates"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'quiz-templates');

CREATE POLICY "Faculty can upload templates"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'quiz-templates');

CREATE POLICY "Faculty can manage their own quiz uploads"
  ON storage.objects FOR ALL
  USING (bucket_id = 'quiz-uploads' AND (storage.foldername(name))[1] = public.auth_uid())
  WITH CHECK (bucket_id = 'quiz-uploads' AND (storage.foldername(name))[1] = public.auth_uid());

-- 8. Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.quizzes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_responses;
