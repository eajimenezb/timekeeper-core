
-- Fix locations RLS: drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Admins can insert locations in their company" ON public.locations;
DROP POLICY IF EXISTS "Admins can update locations in their company" ON public.locations;
DROP POLICY IF EXISTS "Admins can delete locations in their company" ON public.locations;
DROP POLICY IF EXISTS "Users can view locations in their company" ON public.locations;

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
