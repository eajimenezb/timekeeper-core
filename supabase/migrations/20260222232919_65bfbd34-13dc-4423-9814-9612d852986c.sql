
-- Create updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Company settings table
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  welcome_message text NOT NULL DEFAULT 'Welcome!',
  use_emojis boolean NOT NULL DEFAULT true,
  secondary_font text NOT NULL DEFAULT 'Inter',
  button_shape text NOT NULL DEFAULT 'rounded',
  primary_color text NOT NULL DEFAULT '234 89% 64%',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company settings"
ON public.company_settings FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can insert their company settings"
ON public.company_settings FOR INSERT
WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Admins can update their company settings"
ON public.company_settings FOR UPDATE
USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE TRIGGER update_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
