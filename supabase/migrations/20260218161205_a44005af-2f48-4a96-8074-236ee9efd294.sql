
-- Companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Users table
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL CHECK (role IN ('admin', 'employee')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Time entries table
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  clock_in_at timestamp with time zone,
  clock_out_at timestamp with time zone,
  clock_in_lat numeric,
  clock_in_lng numeric,
  clock_out_lat numeric,
  clock_out_lng numeric,
  clock_in_location text,
  clock_out_location text,
  total_seconds integer,
  status text CHECK (status IN ('active', 'completed')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_users_company_id ON public.users(company_id);
CREATE INDEX idx_time_entries_company_id ON public.time_entries(company_id);
CREATE INDEX idx_time_entries_user_id ON public.time_entries(user_id);
CREATE INDEX idx_time_entries_status ON public.time_entries(status);
CREATE INDEX idx_time_entries_clock_in_at ON public.time_entries(clock_in_at);

-- Unique partial index: only one active clock-in per user
CREATE UNIQUE INDEX one_active_clockin_per_user
ON public.time_entries(user_id)
WHERE status = 'active';

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's company_id (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.users WHERE id = _user_id
$$;

-- Helper function to check if user is admin in their company
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = _user_id AND role = 'admin'
  )
$$;

-- RLS Policies for companies
CREATE POLICY "Users can view their own company"
ON public.companies FOR SELECT
TO authenticated
USING (id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can update their own company"
ON public.companies FOR UPDATE
TO authenticated
USING (id = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid()));

-- RLS Policies for users (tenant-isolated)
CREATE POLICY "Users can view members of their company"
ON public.users FOR SELECT
TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can insert users into their company"
ON public.users FOR INSERT
TO authenticated
WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid()));

CREATE POLICY "Admins can update users in their company"
ON public.users FOR UPDATE
TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid()));

CREATE POLICY "Admins can delete users in their company"
ON public.users FOR DELETE
TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid()));

-- RLS Policies for time_entries (tenant-isolated)
CREATE POLICY "Users can view time entries in their company"
ON public.time_entries FOR SELECT
TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert their own time entries"
ON public.time_entries FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND user_id = auth.uid()
);

CREATE POLICY "Users can update their own time entries"
ON public.time_entries FOR UPDATE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND user_id = auth.uid()
);

CREATE POLICY "Admins can update any time entry in their company"
ON public.time_entries FOR UPDATE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
);

CREATE POLICY "Admins can delete time entries in their company"
ON public.time_entries FOR DELETE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
);
