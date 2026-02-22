
-- Create locations table
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  error_margin_meters integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view locations in their company"
ON public.locations FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can insert locations in their company"
ON public.locations FOR INSERT
WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Admins can update locations in their company"
ON public.locations FOR UPDATE
USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Admins can delete locations in their company"
ON public.locations FOR DELETE
USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

-- Add location_id to users table
ALTER TABLE public.users ADD COLUMN location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;
