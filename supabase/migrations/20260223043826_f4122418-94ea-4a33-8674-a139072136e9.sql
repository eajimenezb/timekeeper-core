
-- Add is_confirmed column to users table (false = pending invite)
ALTER TABLE public.users ADD COLUMN is_confirmed boolean NOT NULL DEFAULT true;

-- Set existing users as confirmed
UPDATE public.users SET is_confirmed = true;

-- New employees created via invite will have is_confirmed = false
