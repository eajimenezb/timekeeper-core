
-- Add new columns to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS max_seats integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamp with time zone;

-- Add is_active to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Set trial_ends_at for existing companies that don't have it
UPDATE public.companies SET trial_ends_at = created_at + interval '14 days' WHERE trial_ends_at IS NULL;

-- Replace the trigger function to include trial logic
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_company_id uuid;
BEGIN
  -- Create a default company with 14-day trial
  INSERT INTO public.companies (name, plan_type, subscription_status, max_seats, trial_ends_at, created_at)
  VALUES ('My Company', 'trial', 'trialing', 5, now() + interval '14 days', now())
  RETURNING id INTO new_company_id;

  -- Create the admin profile
  INSERT INTO public.users (id, company_id, email, full_name, role, is_active, created_at)
  VALUES (
    NEW.id,
    new_company_id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'admin',
    true,
    now()
  );

  RETURN NEW;
END;
$$;
