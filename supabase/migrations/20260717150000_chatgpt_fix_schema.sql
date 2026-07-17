BEGIN;

-- ============================================================
-- 1. Drop foreign key constraints
-- ============================================================

ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

ALTER TABLE public.sessions
DROP CONSTRAINT IF EXISTS sessions_creator_id_fkey;

-- If profiles.id references auth.users(id), remove it too.
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- ============================================================
-- 2. Convert UUID columns to TEXT
-- ============================================================

ALTER TABLE public.profiles
ALTER COLUMN id TYPE TEXT
USING id::text;

ALTER TABLE public.user_roles
ALTER COLUMN user_id TYPE TEXT
USING user_id::text;

ALTER TABLE public.sessions
ALTER COLUMN creator_id TYPE TEXT
USING creator_id::text;

-- ============================================================
-- 3. Recreate foreign keys
-- ============================================================

ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

ALTER TABLE public.sessions
ADD CONSTRAINT sessions_creator_id_fkey
FOREIGN KEY (creator_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- ============================================================
-- 4. Update auth_uid() to return TEXT
-- ============================================================

DROP FUNCTION IF EXISTS public.auth_uid();

CREATE OR REPLACE FUNCTION public.auth_uid()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
SELECT
  COALESCE(
    current_setting('request.headers', true)::json->>'x-firebase-uid',
    ''
  );
$$;

COMMIT;
