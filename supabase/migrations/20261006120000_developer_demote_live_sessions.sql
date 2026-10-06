CREATE OR REPLACE FUNCTION public.developer_demote_live_sessions(
    dev_passkey text,
    target_session_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    valid_pass_hash text := '986537071123a92dcadc6617b5679c4c67cf1f0a00adf3413904ff105b336de7';
    updated_count integer := 0;
BEGIN
    IF dev_passkey IS NULL OR encode(digest(dev_passkey, 'sha256'), 'hex') != valid_pass_hash THEN
        RAISE EXCEPTION 'Access denied: unauthorized developer request';
    END IF;

    IF target_session_ids IS NULL OR array_length(target_session_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    UPDATE public.sessions
    SET status = 'draft',
        expires_at = NULL,
        current_question_id = NULL
    WHERE id = ANY(target_session_ids)
      AND status = 'live';

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.developer_demote_live_sessions(text, uuid[]) TO authenticated, anon;
