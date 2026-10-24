-- Security Helper for Firebase Auth
CREATE OR REPLACE FUNCTION public.auth_uid()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true)::json->>'sub', ''),
    nullif(current_setting('request.headers', true)::json->>'x-firebase-uid', '')
  )::text;
$$;

-- Drop legacy policies across all tables to avoid dependency locks during column type reconciliation
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

DROP POLICY IF EXISTS "Anyone can view sessions" ON public.sessions;
DROP POLICY IF EXISTS "Faculty manage own sessions" ON public.sessions;

DROP POLICY IF EXISTS "Anyone view questions" ON public.questions;
DROP POLICY IF EXISTS "Faculty manage own questions" ON public.questions;

DROP POLICY IF EXISTS "Anyone view participants" ON public.participants;
DROP POLICY IF EXISTS "Anyone can join a session" ON public.participants;
DROP POLICY IF EXISTS "Faculty delete own session participants" ON public.participants;

DROP POLICY IF EXISTS "Anyone view responses" ON public.responses;
DROP POLICY IF EXISTS "Anyone submit response" ON public.responses;

-- Role enum + user_roles (idempotent with enum label reconciliation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'app_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('faculty', 'admin');
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'faculty'
    ) THEN
      ALTER TYPE public.app_role ADD VALUE 'faculty';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'admin'
    ) THEN
      ALTER TYPE public.app_role ADD VALUE 'admin';
    END IF;
  END IF;
END $$;

-- Profiles (id is TEXT for Firebase)
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure id column is TEXT if created under legacy UUID schema
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
    ALTER TABLE public.profiles ALTER COLUMN id TYPE TEXT USING id::text;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated, anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (public.auth_uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (public.auth_uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (public.auth_uid() = id);

-- Note: We REMOVED the `handle_new_user()` trigger on `auth.users` because Firebase users are not in Supabase `auth.users`. 
-- The React frontend (auth.tsx) handles inserting the profile manually on first login!

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'faculty',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Ensure user_id column is TEXT if legacy UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'user_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
    ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

GRANT SELECT ON public.user_roles TO authenticated, anon;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (public.auth_uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id text, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'session_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.session_status AS ENUM ('draft', 'live', 'ended');
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.session_status'::regtype AND enumlabel = 'draft'
    ) THEN
      ALTER TYPE public.session_status ADD VALUE 'draft';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.session_status'::regtype AND enumlabel = 'live'
    ) THEN
      ALTER TYPE public.session_status ADD VALUE 'live';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.session_status'::regtype AND enumlabel = 'ended'
    ) THEN
      ALTER TYPE public.session_status ADD VALUE 'ended';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  creator_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.session_status NOT NULL DEFAULT 'draft',
  current_question_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure creator_id column is TEXT if legacy UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'creator_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_creator_id_fkey;
    ALTER TABLE public.sessions ALTER COLUMN creator_id TYPE TEXT USING creator_id::text;
    ALTER TABLE public.sessions ADD CONSTRAINT sessions_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated, anon;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sessions" ON public.sessions FOR SELECT USING (true);
CREATE POLICY "Faculty manage own sessions" ON public.sessions FOR ALL 
  USING (public.auth_uid() = creator_id) WITH CHECK (public.auth_uid() = creator_id);

-- Questions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'question_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.question_type AS ENUM ('wordcloud', 'poll', 'quiz');
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.question_type'::regtype AND enumlabel = 'wordcloud'
    ) THEN
      ALTER TYPE public.question_type ADD VALUE 'wordcloud';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.question_type'::regtype AND enumlabel = 'poll'
    ) THEN
      ALTER TYPE public.question_type ADD VALUE 'poll';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.question_type'::regtype AND enumlabel = 'quiz'
    ) THEN
      ALTER TYPE public.question_type ADD VALUE 'quiz';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  type public.question_type NOT NULL,
  title TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated, anon;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Faculty manage own questions" ON public.questions FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.creator_id = public.auth_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.creator_id = public.auth_uid()));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_current_question_fk'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions ADD CONSTRAINT sessions_current_question_fk
      FOREIGN KEY (current_question_id) REFERENCES public.questions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Participants
CREATE TABLE IF NOT EXISTS public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated, anon;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view participants" ON public.participants FOR SELECT USING (true);
CREATE POLICY "Anyone can join a session" ON public.participants FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.status IN ('live','draft'))
);
CREATE POLICY "Faculty delete own session participants" ON public.participants FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.creator_id = public.auth_uid()));

-- Responses
CREATE TABLE IF NOT EXISTS public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.responses TO authenticated, anon;
GRANT ALL ON public.responses TO service_role;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view responses" ON public.responses FOR SELECT USING (true);
CREATE POLICY "Anyone submit response" ON public.responses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.questions q JOIN public.sessions s ON s.id = q.session_id
          WHERE q.id = question_id AND s.status = 'live')
);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'questions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.questions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'responses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.responses;
  END IF;
END $$;
