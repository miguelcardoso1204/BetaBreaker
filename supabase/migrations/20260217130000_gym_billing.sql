-- ===========================================================================
-- Migration: Gym Billing (Step 13.3)
-- ===========================================================================
--
-- Adds the B2B billing infrastructure for gyms. Each gym pays €0.50 per
-- active user per month (FR-L2). "Active" = at least one ascent logged
-- at that gym's routes during the billing period.
--
-- WHAT THIS MIGRATION CREATES:
--   1. gym_billing_records table — one row per gym per billing period
--   2. get_gym_active_user_count() — helper that counts distinct users
--      with ascents at a gym in a date range
--   3. generate_monthly_billing() — generates billing records for all gyms
--   4. pg_cron job — runs generate_monthly_billing() on the 1st of each month
--
-- WHY SECURITY DEFINER?
-- The billing functions need to read route_ascents and write to
-- gym_billing_records regardless of who calls them. SECURITY DEFINER
-- executes with the function owner's privileges (postgres superuser),
-- bypassing RLS. The search_path is locked down to prevent search-path
-- injection attacks.
-- ===========================================================================


-- ===========================================================================
-- 1. gym_billing_records table
-- ===========================================================================

CREATE TABLE public.gym_billing_records (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which gym this billing record is for
  gym_id            uuid        NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  -- The start and end dates of the billing period (typically one calendar month)
  period_start      date        NOT NULL,
  period_end        date        NOT NULL,
  -- How many distinct users logged at least one ascent at this gym during the period
  active_user_count integer     NOT NULL CHECK (active_user_count >= 0),
  -- The per-user rate at the time of billing (stored for historical accuracy —
  -- if we change the rate later, old records still show what was charged)
  rate_per_user_eur numeric(10,2) NOT NULL DEFAULT 0.50,
  -- total_due = active_user_count × rate_per_user_eur
  total_due_eur     numeric(10,2) NOT NULL CHECK (total_due_eur >= 0),
  -- Lifecycle: pending → invoiced → paid
  status            text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invoiced', 'paid')),
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- One billing record per gym per period — prevents duplicate billing
  UNIQUE (gym_id, period_start),
  -- Sanity check: the period must have positive duration
  CHECK (period_end > period_start)
);

-- Index for efficient per-gym history queries (admin dashboard)
CREATE INDEX idx_gym_billing_records_gym_period
  ON public.gym_billing_records (gym_id, period_start);


-- ===========================================================================
-- 2. RLS — gym admins can read their own gym's billing, nobody else writes
-- ===========================================================================

ALTER TABLE public.gym_billing_records ENABLE ROW LEVEL SECURITY;

-- Gym admins (and super admins) can view billing records for their gym.
-- The subquery checks user_gym_roles to see if the current user has
-- gym_admin or super_admin role at the billing record's gym.
CREATE POLICY gym_billing_select_admin
  ON public.gym_billing_records
  FOR SELECT TO authenticated
  USING (
    gym_id IN (
      SELECT ugr.gym_id
      FROM public.user_gym_roles ugr
      WHERE ugr.user_id = auth.uid()
        AND ugr.role IN ('gym_admin', 'super_admin')
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Only the superuser (via generate_monthly_billing() SECURITY DEFINER)
-- and service_role can write billing records. This prevents gyms from
-- modifying their own invoices.


-- ===========================================================================
-- 3. get_gym_active_user_count() — helper function
-- ===========================================================================
-- Returns the count of distinct users who logged at least one ascent
-- at a given gym's routes within a date range. Used by both:
--   - generate_monthly_billing() for invoice generation
--   - The admin dashboard for "current month so far" projections
--
-- Join path: route_ascents → routes (gym_id) to map ascents to gyms.
-- We filter on route_ascents.created_at falling within the date range,
-- using >= period_start and < period_end for half-open interval semantics
-- (standard for date ranges — avoids double-counting at boundaries).

CREATE OR REPLACE FUNCTION public.get_gym_active_user_count(
  p_gym_id      uuid,
  p_period_start date,
  p_period_end   date
)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(COUNT(DISTINCT ra.user_id), 0)::integer
  FROM public.route_ascents ra
  JOIN public.routes r ON r.id = ra.route_id
  WHERE r.gym_id = p_gym_id
    AND ra.created_at >= p_period_start
    AND ra.created_at < p_period_end;
$$;


-- ===========================================================================
-- 4. generate_monthly_billing() — monthly invoice generation
-- ===========================================================================
-- Called by pg_cron on the 1st of each month. For every gym, counts
-- active users in the previous calendar month and inserts a billing record.
--
-- PARAMETERS:
--   target_month (date, optional) — defaults to the 1st of the previous month.
--     Accepts any date; the function extracts the 1st of that month as
--     period_start and the 1st of the next month as period_end.
--     This parameter exists for testability — integration tests can
--     generate billing for a specific month without waiting for cron.
--
-- IDEMPOTENCY:
--   Uses ON CONFLICT (gym_id, period_start) DO NOTHING so calling
--   the function twice for the same month won't create duplicate records.

CREATE OR REPLACE FUNCTION public.generate_monthly_billing(
  target_month date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- The first day of the billing period
  v_period_start date;
  -- The first day of the month AFTER the billing period (exclusive upper bound)
  v_period_end   date;
  -- Loop variable for each gym
  v_gym record;
  -- Active user count for the current gym
  v_count integer;
BEGIN
  -- Default to previous month if no target specified
  IF target_month IS NULL THEN
    -- date_trunc returns the 1st of the current month, then we subtract
    -- one month to get the 1st of the previous month
    v_period_start := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
  ELSE
    -- Normalize any date to the 1st of its month
    v_period_start := date_trunc('month', target_month)::date;
  END IF;

  -- Period end is the 1st of the next month (exclusive upper bound)
  v_period_end := (v_period_start + interval '1 month')::date;

  -- Loop through all gyms and generate billing records
  FOR v_gym IN SELECT id FROM public.gyms LOOP
    -- Count distinct active users at this gym for the billing period
    v_count := public.get_gym_active_user_count(
      v_gym.id, v_period_start, v_period_end
    );

    -- Insert a billing record for this gym.
    -- ON CONFLICT ensures idempotency — if we already billed this gym
    -- for this month, the duplicate is silently ignored.
    INSERT INTO public.gym_billing_records (
      gym_id, period_start, period_end,
      active_user_count, rate_per_user_eur, total_due_eur
    ) VALUES (
      v_gym.id,
      v_period_start,
      v_period_end,
      v_count,
      0.50,
      v_count * 0.50
    )
    ON CONFLICT (gym_id, period_start) DO NOTHING;
  END LOOP;
END;
$$;


-- ===========================================================================
-- 5. pg_cron scheduling (safe no-op in local dev)
-- ===========================================================================
-- pg_cron is only available in hosted Supabase environments. In local dev
-- (supabase start), the extension isn't loaded, so we wrap the scheduling
-- in a DO block that checks for the extension first. If pg_cron isn't
-- available, this block does nothing — the function can still be called
-- manually or via integration tests.
--
-- Schedule: 0 3 1 * * = 3:00 AM UTC on the 1st of every month.
-- Running at 3 AM avoids peak traffic and gives a buffer for any timezone
-- edge cases around midnight.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron' AND installed_version IS NOT NULL
  ) THEN
    PERFORM cron.schedule(
      'monthly-gym-billing',
      '0 3 1 * *',
      'SELECT public.generate_monthly_billing()'
    );
  END IF;
END
$$;
