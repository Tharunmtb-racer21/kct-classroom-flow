-- Migration: 20261106182500_allow_user_roles_faculty_insert.sql
-- Description: Allow authenticated users to save their default faculty role during sign-in, while preventing admin self-elevation

DROP POLICY IF EXISTS "Users can insert own default faculty role" ON public.user_roles;

CREATE POLICY "Users can insert own default faculty role"
ON public.user_roles
FOR INSERT
TO authenticated, anon
WITH CHECK (
  public.auth_uid() = user_id
  AND role = 'faculty'::public.app_role
);
