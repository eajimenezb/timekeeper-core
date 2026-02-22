
ALTER TABLE public.locations
  ADD COLUMN logo_url text,
  ADD COLUMN break_after_hours numeric,
  ADD COLUMN break_duration_minutes integer;

INSERT INTO storage.buckets (id, name, public)
VALUES ('location-logos', 'location-logos', true);

CREATE POLICY "Admins can upload location logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'location-logos'
    AND is_company_admin(auth.uid())
  );

CREATE POLICY "Admins can delete location logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'location-logos'
    AND is_company_admin(auth.uid())
  );

CREATE POLICY "Anyone authenticated can view location logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'location-logos');
