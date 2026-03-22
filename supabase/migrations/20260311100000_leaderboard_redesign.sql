-- ===========================================================================
-- Migration: Leaderboard Redesign — Admin-Created with Custom Durations
-- ===========================================================================
-- Replaces the auto-generated ISO-week leaderboard system with explicit
-- leaderboard entities created by gym admins. Each leaderboard has:
--   - A name (e.g., "March Madness", "Flash Friday")
--   - A scoring model (hardest_grade, flash_rate, volume)
--   - A time window (starts_at, ends_at)
--
-- "Active" = ends_at > now() (still accepting entries)
-- "Retired" = ends_at <= now() (read-only, archived)
--
-- Changes:
--   1. Create leaderboards table
--   2. Add leaderboard_id FK to leaderboard_entries, drop period + scoring_model
--   3. Rewrite compute_leaderboard() to work against a leaderboard_id
--   4. Rewrite on_ascent_insert/delete to find active leaderboards for the gym
--   5. Replace get_enrolled_leaderboards() with active/retired filter
--   6. Add get_gym_leaderboards() for the gym screen
--   7. RLS policies on leaderboards table
-- ===========================================================================


-- ===========================================================================
-- 0. Drop old function overloads that CREATE OR REPLACE won't replace
-- ===========================================================================
-- CREATE OR REPLACE with a different parameter signature creates a new
-- overload instead of replacing the old function. We must explicitly drop
-- the old signatures so PostgREST doesn't get confused by ambiguous matches.
DROP FUNCTION IF EXISTS public.get_enrolled_leaderboards(uuid);
DROP FUNCTION IF EXISTS public.compute_leaderboard(uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.compute_leaderboard(uuid, timestamptz, timestamptz, text, text);


-- ===========================================================================
-- 1. Create leaderboards table
-- ===========================================================================
-- Each row is a leaderboard entity created by a gym admin. The scoring_model
-- determines how scores are computed (same 3 models as before). The time
-- window (starts_at → ends_at) defines when ascents count toward this
-- leaderboard. Ascents outside this window are ignored.
CREATE TABLE public.leaderboards (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id         uuid        NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  name           text        NOT NULL,
  scoring_model  text        NOT NULL,
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Scoring model must be one of our supported types
  CONSTRAINT leaderboards_scoring_model_check
    CHECK (scoring_model IN ('hardest_grade', 'flash_rate', 'volume')),
  -- End must be after start
  CONSTRAINT leaderboards_time_window_check
    CHECK (ends_at > starts_at)
);

-- Index for the gym screen: "show all leaderboards for gym X"
CREATE INDEX idx_leaderboards_gym ON public.leaderboards (gym_id);

-- Index for trigger lookups: "find active leaderboards for gym X that cover this timestamp"
CREATE INDEX idx_leaderboards_gym_active ON public.leaderboards (gym_id, starts_at, ends_at);

ALTER TABLE public.leaderboards ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- 2. Modify leaderboard_entries — add leaderboard_id, drop period/scoring_model
-- ===========================================================================
-- First add the new FK column (nullable initially so we can migrate)
ALTER TABLE public.leaderboard_entries
  ADD COLUMN leaderboard_id uuid REFERENCES public.leaderboards (id) ON DELETE CASCADE;

-- Drop the old constraints that reference period and scoring_model
ALTER TABLE public.leaderboard_entries
  DROP CONSTRAINT IF EXISTS leaderboard_entries_gym_user_period_model_key;

ALTER TABLE public.leaderboard_entries
  DROP CONSTRAINT IF EXISTS leaderboard_entries_gym_id_user_id_period_key;

ALTER TABLE public.leaderboard_entries
  DROP CONSTRAINT IF EXISTS leaderboard_scoring_model_check;

-- Drop old indexes
DROP INDEX IF EXISTS idx_leaderboard_gym_period_model;
DROP INDEX IF EXISTS idx_leaderboard_gym_period;

-- Remove old columns — period and scoring_model now live on the leaderboards table
ALTER TABLE public.leaderboard_entries DROP COLUMN IF EXISTS period;
ALTER TABLE public.leaderboard_entries DROP COLUMN IF EXISTS scoring_model;

-- Clear any pre-existing entries that have NULL leaderboard_id (old schema rows).
-- These will be recomputed by the on_ascent_insert trigger when seed data runs.
DELETE FROM public.leaderboard_entries WHERE leaderboard_id IS NULL;

-- Now make leaderboard_id NOT NULL
ALTER TABLE public.leaderboard_entries
  ALTER COLUMN leaderboard_id SET NOT NULL;

-- New unique constraint: one entry per user per leaderboard
ALTER TABLE public.leaderboard_entries
  ADD CONSTRAINT leaderboard_entries_leaderboard_user_key
  UNIQUE (leaderboard_id, user_id);

-- Index for fetching a leaderboard's ranked entries
CREATE INDEX idx_leaderboard_entries_leaderboard
  ON public.leaderboard_entries (leaderboard_id);


-- ===========================================================================
-- 3. RLS policies on leaderboards table
-- ===========================================================================
-- All authenticated users can read leaderboards (they're public within the app).
-- Only gym admins can create/update/delete leaderboards for their gym.

CREATE POLICY leaderboards_select_authenticated ON public.leaderboards
  FOR SELECT TO authenticated
  USING (true);

-- Gym admins can insert leaderboards for gyms they manage
CREATE POLICY leaderboards_insert_admin ON public.leaderboards
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_gym_roles ugr
      WHERE ugr.user_id = auth.uid()
        AND ugr.gym_id = public.leaderboards.gym_id
        AND ugr.role IN ('admin', 'super_admin')
    )
  );

-- Gym admins can update leaderboards for gyms they manage
CREATE POLICY leaderboards_update_admin ON public.leaderboards
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_gym_roles ugr
      WHERE ugr.user_id = auth.uid()
        AND ugr.gym_id = public.leaderboards.gym_id
        AND ugr.role IN ('admin', 'super_admin')
    )
  );

-- Gym admins can delete leaderboards for gyms they manage
CREATE POLICY leaderboards_delete_admin ON public.leaderboards
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_gym_roles ugr
      WHERE ugr.user_id = auth.uid()
        AND ugr.gym_id = public.leaderboards.gym_id
        AND ugr.role IN ('admin', 'super_admin')
    )
  );


-- ===========================================================================
-- 4. Rewrite compute_leaderboard() — now takes a leaderboard_id
-- ===========================================================================
-- Instead of (gym_id, period_start, period_end, period_label, scoring_model),
-- the function now reads the leaderboard row to get gym_id, time window, and
-- scoring model. This centralizes the source of truth in the leaderboards table.
CREATE OR REPLACE FUNCTION public.compute_leaderboard(p_leaderboard_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id        uuid;
  v_starts_at     timestamptz;
  v_ends_at       timestamptz;
  v_scoring_model text;
BEGIN
  -- Look up the leaderboard's configuration
  SELECT gym_id, starts_at, ends_at, scoring_model
  INTO v_gym_id, v_starts_at, v_ends_at, v_scoring_model
  FROM public.leaderboards
  WHERE id = p_leaderboard_id;

  -- If leaderboard doesn't exist, bail out
  IF v_gym_id IS NULL THEN
    RETURN;
  END IF;

  -- Clear existing entries for this leaderboard, then re-insert.
  -- Simpler than upsert and handles users whose ascents were all deleted.
  DELETE FROM public.leaderboard_entries
  WHERE leaderboard_id = p_leaderboard_id;

  IF v_scoring_model = 'hardest_grade' THEN
    -- Score = MAX(canonical_grade) among successful ascents in the time window.
    INSERT INTO public.leaderboard_entries
      (gym_id, user_id, leaderboard_id, score, rank, updated_at)
    SELECT
      v_gym_id,
      scored.user_id,
      p_leaderboard_id,
      scored.score,
      RANK() OVER (ORDER BY scored.score DESC),
      now()
    FROM (
      SELECT
        ra.user_id,
        MAX(r.canonical_grade) AS score
      FROM public.route_ascents ra
      JOIN public.routes r ON r.id = ra.route_id
      WHERE r.gym_id = v_gym_id
        AND ra.status IN ('flash', 'send')
        AND ra.created_at >= v_starts_at
        AND ra.created_at < v_ends_at
      GROUP BY ra.user_id
    ) AS scored;

  ELSIF v_scoring_model = 'flash_rate' THEN
    -- Score = flash_count / total_sends — decimal 0.0–1.0
    INSERT INTO public.leaderboard_entries
      (gym_id, user_id, leaderboard_id, score, rank, updated_at)
    SELECT
      v_gym_id,
      scored.user_id,
      p_leaderboard_id,
      scored.score,
      RANK() OVER (ORDER BY scored.score DESC),
      now()
    FROM (
      SELECT
        ra.user_id,
        ROUND(
          COUNT(*) FILTER (WHERE ra.status = 'flash')::numeric
          / NULLIF(COUNT(*)::numeric, 0),
          4
        ) AS score
      FROM public.route_ascents ra
      JOIN public.routes r ON r.id = ra.route_id
      WHERE r.gym_id = v_gym_id
        AND ra.status IN ('flash', 'send')
        AND ra.created_at >= v_starts_at
        AND ra.created_at < v_ends_at
      GROUP BY ra.user_id
    ) AS scored;

  ELSIF v_scoring_model = 'volume' THEN
    -- Score = COUNT of successful ascents (flash + send)
    INSERT INTO public.leaderboard_entries
      (gym_id, user_id, leaderboard_id, score, rank, updated_at)
    SELECT
      v_gym_id,
      scored.user_id,
      p_leaderboard_id,
      scored.score,
      RANK() OVER (ORDER BY scored.score DESC),
      now()
    FROM (
      SELECT
        ra.user_id,
        COUNT(*)::numeric AS score
      FROM public.route_ascents ra
      JOIN public.routes r ON r.id = ra.route_id
      WHERE r.gym_id = v_gym_id
        AND ra.status IN ('flash', 'send')
        AND ra.created_at >= v_starts_at
        AND ra.created_at < v_ends_at
      GROUP BY ra.user_id
    ) AS scored;

  END IF;
END;
$$;


-- ===========================================================================
-- 5. Rewrite on_ascent_insert() — find active leaderboards for the gym
-- ===========================================================================
-- Instead of computing ISO week boundaries and calling compute_leaderboard 3x,
-- this now finds all active leaderboards for the ascent's gym whose time window
-- covers the ascent timestamp, and recomputes each one.
CREATE OR REPLACE FUNCTION public.on_ascent_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id       uuid;
  v_route_grade  integer;
  v_lb           record;
BEGIN
  -- Look up the route's gym_id and canonical_grade
  SELECT r.gym_id, r.canonical_grade
  INTO v_gym_id, v_route_grade
  FROM public.routes r
  WHERE r.id = NEW.route_id;

  -- 1. Recompute streak (must run before badge check for streak_weeks badges)
  PERFORM public.recompute_streak(NEW.user_id);

  -- 2. Check and award any earned badges
  PERFORM public.check_and_award_badges(NEW.user_id, v_route_grade, NEW.status);

  -- 3. Update grade consensus if the climber submitted a perceived grade
  PERFORM public.check_grade_consensus(NEW.route_id);

  -- 4. Recompute all active leaderboards for this gym that cover this ascent's
  --    timestamp. A leaderboard is "active" if its ends_at hasn't passed yet,
  --    but we recompute any leaderboard whose window includes this ascent.
  FOR v_lb IN
    SELECT id FROM public.leaderboards
    WHERE gym_id = v_gym_id
      AND starts_at <= NEW.created_at
      AND ends_at > NEW.created_at
  LOOP
    PERFORM public.compute_leaderboard(v_lb.id);
  END LOOP;

  -- 5. Update progress for any active challenges at this gym
  PERFORM public.update_challenge_progress(NEW.user_id, NEW.route_id, NEW.status);

  RETURN NEW;
END;
$$;


-- ===========================================================================
-- 6. Rewrite on_ascent_delete() — find leaderboards covering the deleted ascent
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.on_ascent_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id           uuid;
  v_profile_exists   boolean;
  v_lb               record;
BEGIN
  -- Guard: skip if profile is being cascade-deleted
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = OLD.user_id
  ) INTO v_profile_exists;

  IF NOT v_profile_exists THEN
    RETURN OLD;
  END IF;

  SELECT r.gym_id
  INTO v_gym_id
  FROM public.routes r
  WHERE r.id = OLD.route_id;

  IF v_gym_id IS NULL THEN
    PERFORM public.recompute_streak(OLD.user_id);
    RETURN OLD;
  END IF;

  -- 1. Recompute streak
  PERFORM public.recompute_streak(OLD.user_id);

  -- 2. Recheck grade consensus
  PERFORM public.check_grade_consensus(OLD.route_id);

  -- 3. Recompute all leaderboards whose time window covers the deleted ascent
  FOR v_lb IN
    SELECT id FROM public.leaderboards
    WHERE gym_id = v_gym_id
      AND starts_at <= OLD.created_at
      AND ends_at > OLD.created_at
  LOOP
    PERFORM public.compute_leaderboard(v_lb.id);
  END LOOP;

  RETURN OLD;
END;
$$;


-- ===========================================================================
-- 7. Replace get_enrolled_leaderboards() — now with active/retired filter
-- ===========================================================================
-- Returns the user's leaderboard entries enriched with leaderboard metadata.
-- p_active = true  → only leaderboards where ends_at > now() (still running)
-- p_active = false → only leaderboards where ends_at <= now() (finished)
CREATE OR REPLACE FUNCTION public.get_enrolled_leaderboards(
  p_user_id uuid,
  p_active  boolean DEFAULT true
)
RETURNS TABLE (
  id                  uuid,
  leaderboard_id      uuid,
  gym_id              uuid,
  gym_name            text,
  leaderboard_name    text,
  scoring_model       text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  rank                integer,
  score               numeric,
  total_participants  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    le.id,
    lb.id AS leaderboard_id,
    lb.gym_id,
    g.name AS gym_name,
    lb.name AS leaderboard_name,
    lb.scoring_model,
    lb.starts_at,
    lb.ends_at,
    le.rank,
    le.score,
    participants.cnt AS total_participants
  FROM public.leaderboard_entries le
  -- Join to leaderboards for metadata (name, scoring_model, time window)
  JOIN public.leaderboards lb ON lb.id = le.leaderboard_id
  -- Join to gyms for display name
  JOIN public.gyms g ON g.id = lb.gym_id
  -- Count total participants per leaderboard
  CROSS JOIN LATERAL (
    SELECT COUNT(DISTINCT le2.user_id) AS cnt
    FROM public.leaderboard_entries le2
    WHERE le2.leaderboard_id = lb.id
  ) participants
  WHERE le.user_id = p_user_id
    -- Filter by active (ends_at > now) or retired (ends_at <= now)
    AND CASE
      WHEN p_active THEN lb.ends_at > now()
      ELSE lb.ends_at <= now()
    END
  ORDER BY lb.ends_at DESC, g.name ASC;
$$;


-- ===========================================================================
-- 8. get_gym_leaderboards() — list leaderboards for a gym
-- ===========================================================================
-- Used by the gym leaderboard screen. Returns leaderboard metadata with
-- participant counts, filtered by active/retired status.
CREATE OR REPLACE FUNCTION public.get_gym_leaderboards(
  p_gym_id uuid,
  p_active boolean DEFAULT true
)
RETURNS TABLE (
  id                  uuid,
  name                text,
  scoring_model       text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  total_participants  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    lb.id,
    lb.name,
    lb.scoring_model,
    lb.starts_at,
    lb.ends_at,
    (
      SELECT COUNT(DISTINCT le.user_id)
      FROM public.leaderboard_entries le
      WHERE le.leaderboard_id = lb.id
    ) AS total_participants
  FROM public.leaderboards lb
  WHERE lb.gym_id = p_gym_id
    AND CASE
      WHEN p_active THEN lb.ends_at > now()
      ELSE lb.ends_at <= now()
    END
  ORDER BY lb.ends_at DESC;
$$;
