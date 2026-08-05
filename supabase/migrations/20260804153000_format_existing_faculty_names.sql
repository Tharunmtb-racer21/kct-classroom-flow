-- Migration: 20260804153000_format_existing_faculty_names.sql
-- Description: Capitalizes and formats all existing full_name entries in public.profiles table from email handles

UPDATE public.profiles
SET full_name = INITCAP(
  REPLACE(
    REPLACE(
      REPLACE(
        SPLIT_PART(email, '@', 1),
        '.', ' '
      ),
      '_', ' '
    ),
    '-', ' '
  )
)
WHERE full_name IS NULL 
   OR full_name = '' 
   OR full_name LIKE 'faculty_%' 
   OR full_name LIKE 'Faculty Member%';
