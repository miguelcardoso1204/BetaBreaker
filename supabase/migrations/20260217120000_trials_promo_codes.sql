-- Step 13.2: Trials & Promo Codes
--
-- Two new tables for the trial / promo-code system:
--
-- 1. promo_codes — admin-created codes that grant temporary Pro access
-- 2. user_trials — tracks each user's trial status (one trial per user)
--
-- Plus a Postgres function `expire_trials()` that a cron job calls nightly
-- to flip expired trials to 'expired' and revert the user's tier to 'free'
-- (only if they don't have an active paid subscription).
--
-- WRITE ACCESS:
-- Both tables are read-only for the authenticated role. Only the service_role
-- (Edge Function: redeem-promo) can INSERT/UPDATE. This prevents users from
-- granting themselves trials via direct PostgREST calls.

-- ==========================================================================
-- promo_codes table
-- ==========================================================================
-- Stores promotional codes created by admins. Each code has a type (trial or
-- discount), a duration, and a usage cap. The `current_uses` counter is
-- atomically incremented by the redeem-promo Edge Function.

CREATE TABLE promo_codes (
  -- Primary key
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The code string users type in (e.g., "BETAFRIEND7"). Case-sensitive,
  -- globally unique so two codes can't collide.
  code           text NOT NULL UNIQUE,

  -- What the code does: 'trial' grants temporary Pro, 'discount' is reserved.
  -- CHECK constraint matches PROMO_CODE_TYPES in lib/constants.ts.
  type           text NOT NULL CHECK (type IN ('trial', 'discount')),

  -- How many days the benefit lasts. For trial codes, this is the trial length.
  duration_days  integer NOT NULL CHECK (duration_days > 0),

  -- Maximum number of users who can redeem this code.
  max_uses       integer NOT NULL CHECK (max_uses > 0),

  -- How many times the code has been redeemed so far. The Edge Function
  -- increments this atomically with `current_uses = current_uses + 1`.
  current_uses   integer NOT NULL DEFAULT 0 CHECK (current_uses >= 0),

  -- Admin kill-switch: set to false to disable a code without deleting it.
  active         boolean NOT NULL DEFAULT true,

  created_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can look up codes to check validity, but can't modify them.
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- Authenticated users can SELECT promo codes (to verify a code exists and
-- is still valid). The actual redemption happens server-side via Edge Function.
CREATE POLICY "select_promo_codes" ON promo_codes
  FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies — only service_role can manage codes.

-- ==========================================================================
-- user_trials table
-- ==========================================================================
-- One row per user who has ever started a trial. UNIQUE(user_id) enforces
-- the "one trial per user" business rule at the database level, so even if
-- the Edge Function has a bug, a user can't start two trials.

CREATE TABLE user_trials (
  -- Primary key
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The user on trial. CASCADE ensures cleanup on account deletion.
  -- UNIQUE enforces one trial per user — a second INSERT for the same
  -- user_id will fail with a duplicate key error.
  user_id        uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,

  -- Which promo code was redeemed. SET NULL on delete so we keep the trial
  -- record even if the admin deletes the promo code later.
  promo_code_id  uuid REFERENCES promo_codes(id) ON DELETE SET NULL,

  -- When the trial started
  started_at     timestamptz NOT NULL DEFAULT now(),

  -- When Pro access ends. Calculated at redemption time as
  -- now() + promo_codes.duration_days.
  expires_at     timestamptz NOT NULL,

  -- 'active' while the trial is running, 'expired' after expire_trials() runs.
  -- CHECK constraint matches TRIAL_STATUSES in lib/constants.ts.
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),

  created_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only see their own trial record.
ALTER TABLE user_trials ENABLE ROW LEVEL SECURITY;

-- Each user can SELECT their own trial row to check status/expiration.
CREATE POLICY "select_own_trial" ON user_trials
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies — only service_role (Edge Function) can write.

-- Partial index for the cron job: quickly find active trials that have expired.
-- The cron job queries `WHERE status = 'active' AND expires_at <= now()`, so
-- this index makes that scan touch only active trials, not the full table.
CREATE INDEX idx_user_trials_active_expiry
  ON user_trials (status, expires_at)
  WHERE status = 'active';

-- Index for user lookups (the common query pattern: "does this user have a trial?")
CREATE INDEX idx_user_trials_user ON user_trials (user_id);

-- ==========================================================================
-- expire_trials() function
-- ==========================================================================
-- Called nightly by pg_cron to handle trial expiration:
--   1. Find active trials where expires_at is in the past
--   2. Mark them as 'expired'
--   3. Revert the user's tier to 'free' — BUT only if they don't have an
--      active paid subscription (a user might have started a trial, then
--      purchased a subscription before the trial ended)
--
-- SECURITY DEFINER: runs with the function owner's privileges (postgres),
-- bypassing RLS. This is necessary because the cron job doesn't run as an
-- authenticated user — it's a background system process.

CREATE OR REPLACE FUNCTION expire_trials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Step 1: Mark expired active trials
  UPDATE public.user_trials
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at <= now();

  -- Step 2: Revert tier to 'free' for users whose trial just expired,
  -- but ONLY if they don't have an active paid subscription.
  --
  -- A user has an active paid subscription if there's a row in
  -- subscription_events with event_type in ('purchase', 'renewal', 'restore')
  -- and expires_at in the future. In that case, they're paying for Pro
  -- and we shouldn't downgrade them just because their trial also ended.
  UPDATE public.profiles
  SET tier = 'free'
  WHERE id IN (
    SELECT user_id
    FROM public.user_trials
    WHERE status = 'expired'
  )
  AND tier = 'pro'
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscription_events se
    WHERE se.user_id = public.profiles.id
      AND se.event_type IN ('purchase', 'renewal', 'restore')
      AND se.expires_at > now()
  );
END;
$$;

-- ==========================================================================
-- pg_cron scheduling (production only)
-- ==========================================================================
-- pg_cron is available on Supabase hosted but NOT in the local Docker image.
-- This DO block checks whether the extension is available before scheduling,
-- so the migration doesn't fail locally.
--
-- Schedule: 2 AM UTC daily — low-traffic time for most users.
-- The job calls expire_trials() to clean up any trials that ended overnight.

DO $$
BEGIN
  -- Only attempt to schedule if pg_cron extension is available
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    -- Ensure the extension is created (idempotent)
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Schedule the nightly expiration job.
    -- cron.schedule is idempotent — if 'expire-trials' already exists,
    -- it updates the schedule instead of creating a duplicate.
    PERFORM cron.schedule(
      'expire-trials',       -- job name (used for updates/deletes)
      '0 2 * * *',           -- cron expression: 2:00 AM UTC every day
      'SELECT expire_trials()'
    );
  END IF;
END;
$$;
