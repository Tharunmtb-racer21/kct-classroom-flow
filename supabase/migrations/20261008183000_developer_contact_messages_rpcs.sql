-- Migration: 20261008183000_developer_contact_messages_rpcs.sql
-- Description: Create secure developer-only RPCs for fetching, deleting, and updating contact_messages
--              using server-side SHA-256 passkey verification, without weakening existing RLS policies.

-- 1. Secure RPC to fetch contact messages
CREATE OR REPLACE FUNCTION public.get_developer_contact_messages(
    dev_passkey text DEFAULT NULL,
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    name text,
    email text,
    subject text,
    message text,
    user_id text,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    safe_limit integer;
    valid_pass_hash text := '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7';
BEGIN
    -- Validate caller has database admin role OR passes valid plaintext developer passkey.
    -- Server-side passkey is hashed via SHA-256; raw stored hash is never accepted.
    IF NOT (
        public.has_role(public.auth_uid(), 'admin')
        OR (dev_passkey IS NOT NULL AND dev_passkey <> '' AND encode(digest(dev_passkey, 'sha256'), 'hex') = valid_pass_hash)
    ) THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request';
    END IF;

    -- Bounded limit (1 to 500, default 100)
    safe_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

    RETURN QUERY
    SELECT
        cm.id,
        cm.created_at,
        cm.name,
        cm.email,
        cm.subject,
        cm.message,
        cm.user_id,
        cm.status
    FROM public.contact_messages cm
    ORDER BY cm.created_at DESC
    LIMIT safe_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_contact_messages(text, integer) TO authenticated, anon;


-- 2. Secure RPC to delete a specific contact message
CREATE OR REPLACE FUNCTION public.developer_delete_contact_message(
    dev_passkey text DEFAULT NULL,
    target_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    valid_pass_hash text := '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7';
    deleted_count integer;
BEGIN
    -- Validate authorization
    IF NOT (
        public.has_role(public.auth_uid(), 'admin')
        OR (dev_passkey IS NOT NULL AND dev_passkey <> '' AND encode(digest(dev_passkey, 'sha256'), 'hex') = valid_pass_hash)
    ) THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request';
    END IF;

    IF target_id IS NULL THEN
        RAISE EXCEPTION 'Target message ID is required';
    END IF;

    DELETE FROM public.contact_messages
    WHERE id = target_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.developer_delete_contact_message(text, uuid) TO authenticated, anon;


-- 3. Secure RPC to update contact message status
CREATE OR REPLACE FUNCTION public.developer_update_contact_message_status(
    dev_passkey text DEFAULT NULL,
    target_id uuid DEFAULT NULL,
    new_status text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    valid_pass_hash text := '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7';
    updated_count integer;
BEGIN
    -- Validate authorization
    IF NOT (
        public.has_role(public.auth_uid(), 'admin')
        OR (dev_passkey IS NOT NULL AND dev_passkey <> '' AND encode(digest(dev_passkey, 'sha256'), 'hex') = valid_pass_hash)
    ) THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request';
    END IF;

    IF target_id IS NULL THEN
        RAISE EXCEPTION 'Target message ID is required';
    END IF;

    IF new_status IS NULL OR new_status NOT IN ('unread', 'read', 'archived') THEN
        RAISE EXCEPTION 'Invalid status. Permitted values: unread, read, archived';
    END IF;

    UPDATE public.contact_messages
    SET status = new_status
    WHERE id = target_id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.developer_update_contact_message_status(text, uuid, text) TO authenticated, anon;
