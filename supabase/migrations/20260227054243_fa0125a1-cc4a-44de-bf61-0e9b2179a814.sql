
-- Table to store face embeddings (128-dimensional descriptors from face-api.js)
CREATE TABLE public.face_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  descriptor JSONB NOT NULL, -- 128-dim float array from face-api.js
  photo_url TEXT, -- reference to storage bucket
  enrolled_by UUID NOT NULL, -- admin or self
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT one_active_per_user UNIQUE (user_id, is_active)
);

-- Enable RLS
ALTER TABLE public.face_enrollments ENABLE ROW LEVEL SECURITY;

-- Employees can view their own enrollment
CREATE POLICY "Users can view their own face enrollment"
ON public.face_enrollments
FOR SELECT
USING (user_id = auth.uid());

-- Admins can view all enrollments in their company
CREATE POLICY "Admins can view company face enrollments"
ON public.face_enrollments
FOR SELECT
USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

-- Admins can insert enrollments for their company
CREATE POLICY "Admins can insert face enrollments"
ON public.face_enrollments
FOR INSERT
WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

-- Users can insert their own enrollment (self-enrollment)
CREATE POLICY "Users can self-enroll face"
ON public.face_enrollments
FOR INSERT
WITH CHECK (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

-- Admins can update enrollments in their company
CREATE POLICY "Admins can update face enrollments"
ON public.face_enrollments
FOR UPDATE
USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

-- Admins can delete enrollments in their company
CREATE POLICY "Admins can delete face enrollments"
ON public.face_enrollments
FOR DELETE
USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_face_enrollments_updated_at
BEFORE UPDATE ON public.face_enrollments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for face reference photos
INSERT INTO storage.buckets (id, name, public) VALUES ('face-photos', 'face-photos', false);

-- Storage policies: users can upload their own face photo
CREATE POLICY "Users can upload own face photo"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'face-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can view their own face photo
CREATE POLICY "Users can view own face photo"
ON storage.objects FOR SELECT
USING (bucket_id = 'face-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Admins can view any face photo in their company (via edge function with service_role)
CREATE POLICY "Admins can view company face photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'face-photos' AND is_company_admin(auth.uid()));

-- Admins can upload face photos for employees
CREATE POLICY "Admins can upload face photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'face-photos' AND is_company_admin(auth.uid()));

-- Admins can delete face photos
CREATE POLICY "Admins can delete face photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'face-photos' AND is_company_admin(auth.uid()));
