

## Plan: Location Logos and Auto-Break/Lunch Deduction

This plan adds two features to the Manager Dashboard:

### 1. Location Logo Upload

Each location can have a logo/photo uploaded by the manager. The image will be stored in cloud file storage and displayed alongside the location in both the admin and employee dashboards.

**Database changes:**
- Add a `logo_url` column (text, nullable) to the `locations` table
- Create a `location-logos` storage bucket (public) with RLS policies allowing admins to upload/delete and all authenticated users to view

**Admin Dashboard changes:**
- Add an image upload field in the location create/edit modal (file picker with preview)
- On save, upload the image to the `location-logos` bucket, then store the public URL in `logo_url`
- Show the logo thumbnail in the locations list (replacing the generic MapPin icon when a logo exists)

**Employee Dashboard changes:**
- Show the location logo (if available) in the GPS status card next to the assigned location name

### 2. Auto-Break/Lunch Deduction per Location

Managers can configure an automatic break deduction for each location: after X hours of work, Y minutes are subtracted from total daily time.

**Database changes:**
- Add `break_after_hours` column (numeric, nullable, default null) to `locations` -- the number of hours after which a break is applied
- Add `break_duration_minutes` column (integer, nullable, default null) to `locations` -- the length of the break in minutes

**Admin Dashboard changes:**
- Add two new fields in the location modal:
  - "Break after (hours)" -- e.g., 5 hours
  - "Break duration (minutes)" -- e.g., 30 minutes
- Display break policy in the location list as a badge (e.g., "30 min break after 5h")

**Clock-out edge function changes:**
- After calculating `total_seconds`, look up the user's assigned location to check for break settings
- If `break_after_hours` is set and total worked time exceeds that threshold, subtract `break_duration_minutes` from `total_seconds`
- Store the adjusted `total_seconds` in the database

**Admin edit punch edge function changes:**
- Apply the same break deduction logic when recalculating `total_seconds` after a punch edit

---

### Technical Details

**Migration SQL:**
```sql
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
```

**Files to modify:**
- `src/pages/AdminDashboard.tsx` -- logo upload UI, break config fields in location modal, display in list
- `src/pages/EmployeeDashboard.tsx` -- show location logo
- `supabase/functions/clock_out/index.ts` -- apply break deduction on clock-out
- `supabase/functions/admin_edit_punch/index.ts` -- apply break deduction on punch edit

**Break deduction logic (in clock_out):**
```
if location.break_after_hours AND total_seconds > (break_after_hours * 3600):
    total_seconds -= break_duration_minutes * 60
```

