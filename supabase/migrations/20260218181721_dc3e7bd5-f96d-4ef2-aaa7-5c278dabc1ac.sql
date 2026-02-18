
-- Function to auto-create company + user profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id uuid;
BEGIN
  -- Create a default company
  INSERT INTO public.companies (name, created_at)
  VALUES ('My Company', now())
  RETURNING id INTO new_company_id;

  -- Create the user profile linked to the new company
  INSERT INTO public.users (id, company_id, email, full_name, role, created_at)
  VALUES (
    NEW.id,
    new_company_id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'admin',
    now()
  );

  RETURN NEW;
END;
$$;

-- Trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
