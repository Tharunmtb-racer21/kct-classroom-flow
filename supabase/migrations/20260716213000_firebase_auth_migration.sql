-- Drop Supabase auth-based trigger and functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Drop old has_role function that expects UUID
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- Create new has_role function that accepts TEXT (Firebase UID)
CREATE OR REPLACE FUNCTION public.has_role(_user_id text, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Drop foreign key constraints pointing to auth.users(id)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_creator_id_fkey;

-- Alter column types from UUID to TEXT to store Firebase UIDs
ALTER TABLE public.profiles ALTER COLUMN id TYPE text;
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE text;
ALTER TABLE public.sessions ALTER COLUMN creator_id TYPE text;

-- Recreate foreign key constraints pointing to public.profiles(id)
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
