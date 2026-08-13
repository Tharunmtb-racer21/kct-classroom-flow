-- Migration: 20260813123000_create_contact_messages.sql
-- Description: Create contact_messages table, RLS policies, and grants.

CREATE TABLE IF NOT EXISTS public.contact_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    user_id TEXT, -- Firebase user UID if logged in
    status TEXT NOT NULL DEFAULT 'unread' -- 'unread', 'read', 'archived'
);

-- Enable RLS
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- 1. Anyone can insert contact messages (so anonymous visitors or authenticated faculty can contact us)
CREATE POLICY "Anyone can insert contact messages"
    ON public.contact_messages
    FOR INSERT
    WITH CHECK (true);

-- 2. Only admin users can read contact messages
CREATE POLICY "Only admins can view contact messages"
    ON public.contact_messages
    FOR SELECT
    USING (
        public.has_role(public.auth_uid(), 'admin')
    );

-- 3. Only admin users can update contact messages (e.g. mark read/unread)
CREATE POLICY "Only admins can update contact messages"
    ON public.contact_messages
    FOR UPDATE
    USING (
        public.has_role(public.auth_uid(), 'admin')
    );

-- 4. Only admin users can delete contact messages
CREATE POLICY "Only admins can delete contact messages"
    ON public.contact_messages
    FOR DELETE
    USING (
        public.has_role(public.auth_uid(), 'admin')
    );

-- Grant appropriate permissions
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;
