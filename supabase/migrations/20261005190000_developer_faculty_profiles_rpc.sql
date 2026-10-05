-- Migration: 20261005190000_developer_faculty_profiles_rpc.sql
-- Description: Provide a secure, read-only RPC function for Developer Panel to read faculty profile identities (id, full_name, email, avatar_url, created_at) without weakening public.profiles RLS.

CREATE OR REPLACE FUNCTION public.get_developer_faculty_profiles(dev_passkey text DEFAULT NULL)
RETURNS TABLE (
    id text,
    full_name text,
    email text,
    avatar_url text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    -- 1. Check if caller is authenticated as an admin in user_roles
    IF public.has_role(public.auth_uid(), 'admin') THEN
        RETURN QUERY
        SELECT p.id, p.full_name, p.email, p.avatar_url, p.created_at
        FROM public.profiles p
        ORDER BY p.created_at DESC;
        RETURN;
    END IF;

    -- 2. Validate plaintext developer passkey by hashing it on the server.
    -- The raw precomputed hash is NEVER accepted directly. An adversary with access to
    -- the client bundle hash cannot authenticate without knowing the actual plaintext secret.
    IF dev_passkey IS NOT NULL AND dev_passkey <> '' THEN
        IF encode(digest(dev_passkey, 'sha256'), 'hex') = '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7' THEN
            RETURN QUERY
            SELECT p.id, p.full_name, p.email, p.avatar_url, p.created_at
            FROM public.profiles p
            ORDER BY p.created_at DESC;
            RETURN;
        END IF;
    END IF;

    -- 3. Unauthorized access
    RAISE EXCEPTION 'Access denied: unauthorized developer request';
END;
$$;

-- Grant execution to authenticated and anon users (the function itself verifies the passkey or admin role)
GRANT EXECUTE ON FUNCTION public.get_developer_faculty_profiles(text) TO authenticated, anon;
