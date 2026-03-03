

## Payment Plans & Seat Limit Enforcement

### Overview
Add a subscription plans system with 3 tiers (Essential, Professional, Enterprise), enforce seat limits when adding employees, and show an upgrade prompt modal when the limit is reached. No real payment processing — plan changes stored in DB with Stripe-ready schema fields.

### 1. Database Migration

Add columns to the `companies` table for Stripe-readiness and plan details:

```sql
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_period text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS plan_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;
```

Update `plan_type` values to use `essential` / `professional` / `enterprise` (keep `trial` as default for new signups). Update `max_seats` defaults per plan:
- Essential: 10
- Professional: 50  
- Enterprise: 9999

### 2. Seat Limit Check on Employee Creation

Modify `openCreateEmployee` in `AdminDashboard.tsx`:
- Before opening the add employee form, query current active employee count vs `max_seats` from the company record
- If at limit, show an **UpgradePlanModal** instead of the add form
- Fetch company data (plan_type, max_seats, subscription_status) via existing query

### 3. New Components

**`src/components/UpgradePlanModal.tsx`** — Professional SaaS-style upgrade modal:
- Shows current plan and limit reached message
- Displays all 3 plan cards side-by-side (responsive: stacked on mobile)
- Each card shows: plan name, capacity, feature list, price placeholder, "Select" button
- Current plan is highlighted/disabled
- Enterprise card shows "Contact Sales" instead of a price
- Selecting a plan updates `companies.plan_type`, `max_seats`, and `subscription_status` directly in DB
- Bilingual (es/en) support

**`src/pages/PricingPage.tsx`** — Standalone pricing/billing page accessible from admin Settings tab:
- Same 3-tier card layout as the modal but full-page
- Shows current plan status, billing period toggle (monthly/annual)
- Suspension policy info section
- Plan change history (future-ready)

### 4. Suspension Logic

Add to the admin dashboard data fetch:
- If `plan_expires_at` is past and `grace_period_ends_at` is past, mark status as `suspended`
- Suspended admins: hide reports/analytics tabs, show a banner prompting payment
- Employees can still clock in/out (per spec)

### 5. Admin Settings Integration

Add a "Plan & Billing" section to the Settings tab showing:
- Current plan badge
- Seats used / max seats
- Plan expiration date
- Button to open the full pricing page or upgrade modal

### 6. Translation Keys

Add ~25 new keys to `useLanguage.tsx` for plan names, descriptions, upgrade prompts, and billing labels in both Spanish and English.

### Files to Create
- `src/components/UpgradePlanModal.tsx`

### Files to Modify
- `src/pages/AdminDashboard.tsx` — seat check in `openCreateEmployee`, billing section in Settings tab
- `src/hooks/useLanguage.tsx` — new translation keys
- 1 database migration for new columns

### Technical Notes
- Stripe fields (`stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`) are nullable text columns — zero migration needed when Stripe is enabled later
- Plan change writes directly to `companies` table via existing RLS policy (admin can update own company)
- Grace period logic: `grace_period_ends_at = plan_expires_at + 5 days`

