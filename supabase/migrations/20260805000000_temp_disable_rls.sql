-- Temporary migration to disable Row Level Security (RLS) across all tables.
-- This bypasses JWT/Auth validation blocks temporarily for testing/debugging.
-- Run the inverse (ENABLE ROW LEVEL SECURITY) to turn security back on.

ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses DISABLE ROW LEVEL SECURITY;
