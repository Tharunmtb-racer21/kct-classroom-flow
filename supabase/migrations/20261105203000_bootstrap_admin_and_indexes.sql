-- Migration: Bootstrap platform admin roles and apply reports performance indexes
-- Idempotent, safe, and zero data loss.

-- 1. Create performance indexes for reports queries and analytics
CREATE INDEX IF NOT EXISTS idx_sessions_creator_created_at 
ON public.sessions (creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_session_order 
ON public.questions (session_id, order_index ASC);

CREATE INDEX IF NOT EXISTS idx_participants_session_joined 
ON public.participants (session_id, joined_at ASC);

CREATE INDEX IF NOT EXISTS idx_responses_question_created 
ON public.responses (question_id, created_at ASC);

-- 2. Ensure public.is_platform_admin() exists and safely evaluates platform admins
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid text;
    v_claims jsonb;
    v_email text;
BEGIN
    BEGIN
        v_uid := public.auth_uid();
    EXCEPTION WHEN others THEN
        RETURN false;
    END;

    IF v_uid IS NULL OR v_uid = '' THEN
        RETURN false;
    END IF;

    -- Check if user has admin role in public.user_roles
    IF public.has_role(v_uid, 'admin'::public.app_role) THEN
        RETURN true;
    END IF;

    -- Check JWT claims for verified institutional email
    BEGIN
        v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    EXCEPTION WHEN others THEN
        RETURN false;
    END;

    IF v_claims IS NOT NULL THEN
        v_email := lower(btrim(coalesce(v_claims ->> 'email', '')));
        IF v_email IN ('navneeth.23cs@kct.ac.in', 'tharun.23cs@kct.ac.in') THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- 3. Bootstrap verified institutional admin roles in public.user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role
FROM public.profiles p
WHERE lower(p.email) IN ('navneeth.23cs@kct.ac.in', 'tharun.23cs@kct.ac.in')
ON CONFLICT (user_id, role) DO NOTHING;

-- 4. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
