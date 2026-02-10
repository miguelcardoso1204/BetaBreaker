-- ===========================================================================
-- Migration: Add first_flash Badge Criteria Type (Step 8.1)
-- ===========================================================================
-- Extends the badge system to support "flash" achievements. A flash is when
-- a climber completes a route on their very first attempt — a notable feat
-- that deserves its own badge.
--
-- Changes:
--   1. DROP + re-ADD the CHECK constraint on badges.criteria_type to include
--      'first_flash' as a valid type.
--   2. CREATE OR REPLACE the check_and_award_badges() function with a new
--      ELSIF branch that handles 'first_flash' badges.
--   3. Seed the "First Flash" badge definition.
--
-- Why not ALTER the CHECK constraint?
-- ────────────────────────────────────
-- PostgreSQL doesn't support ALTER CONSTRAINT to modify a CHECK constraint
-- in-place. The standard approach is DROP the old one, then ADD a new one
-- with the expanded value list.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Step 1: Expand the CHECK constraint to allow 'first_flash'
-- ---------------------------------------------------------------------------
-- The original constraint (from 20260206002102_functions_triggers.sql:67)
-- only allows 'first_grade', 'total_sends', 'streak_weeks'. We need to
-- add 'first_flash' so we can insert a badge with that criteria_type.

-- Find and drop the existing constraint by its auto-generated name.
-- Postgres names CHECK constraints as <table>_<column>_check by default.
ALTER TABLE public.badges
  DROP CONSTRAINT IF EXISTS badges_criteria_type_check;

-- Re-add with the expanded set of allowed types
ALTER TABLE public.badges
  ADD CONSTRAINT badges_criteria_type_check
  CHECK (criteria_type IN ('first_grade', 'total_sends', 'streak_weeks', 'first_flash'));


-- ---------------------------------------------------------------------------
-- Step 2: Update check_and_award_badges() with first_flash branch
-- ---------------------------------------------------------------------------
-- This is a CREATE OR REPLACE — it overwrites the existing function from
-- 20260206002102_functions_triggers.sql while preserving all existing
-- behavior. The only addition is the 'first_flash' ELSIF branch.
--
-- SECURITY DEFINER: runs as the function owner (postgres), bypassing RLS.
-- This is necessary because gamification tables have SELECT-only RLS policies
-- for authenticated users — the trigger needs to INSERT into user_badges.
CREATE OR REPLACE FUNCTION public.check_and_award_badges(
  p_user_id uuid,
  p_route_grade integer,
  p_ascent_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_badge RECORD;
  v_total_sends bigint;
  v_current_streak integer;
BEGIN
  -- Skip badge checks entirely for attempts — only successful climbs count
  IF p_ascent_status = 'attempt' THEN
    RETURN;
  END IF;

  -- Loop over every badge definition in the badges table
  FOR v_badge IN SELECT id, criteria_type, criteria_value FROM public.badges LOOP

    IF v_badge.criteria_type = 'first_grade' THEN
      -- Award if the ascent's route grade matches the badge's target grade.
      -- ON CONFLICT DO NOTHING prevents duplicates (idempotent).
      IF p_route_grade = v_badge.criteria_value THEN
        INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (p_user_id, v_badge.id)
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;

    ELSIF v_badge.criteria_type = 'total_sends' THEN
      -- Count all successful ascents (flash + send, not attempt) for this user
      SELECT count(*)
      INTO v_total_sends
      FROM public.route_ascents
      WHERE user_id = p_user_id
        AND status IN ('flash', 'send');

      -- Award if count meets or exceeds the threshold
      IF v_total_sends >= v_badge.criteria_value THEN
        INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (p_user_id, v_badge.id)
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;

    ELSIF v_badge.criteria_type = 'streak_weeks' THEN
      -- Check the user's current streak (just updated by recompute_streak)
      SELECT current_streak
      INTO v_current_streak
      FROM public.user_streaks
      WHERE user_id = p_user_id
        AND streak_type = 'weekly';

      -- Award if current streak meets or exceeds the threshold
      IF v_current_streak IS NOT NULL AND v_current_streak >= v_badge.criteria_value THEN
        INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (p_user_id, v_badge.id)
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;

    ELSIF v_badge.criteria_type = 'first_flash' THEN
      -- Award when the user logs their first flash (completing a route on
      -- the first attempt). The "first" aspect is handled by ON CONFLICT
      -- DO NOTHING — subsequent flashes silently skip the duplicate INSERT.
      -- criteria_value is 1 (meaning "at least 1 flash"), but we only check
      -- the current ascent's status since any flash qualifies.
      IF p_ascent_status = 'flash' THEN
        INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (p_user_id, v_badge.id)
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;
    END IF;

  END LOOP;
END;
$$;


-- ---------------------------------------------------------------------------
-- Step 3: Seed the "First Flash" badge
-- ---------------------------------------------------------------------------
-- criteria_value=1 means "complete at least 1 flash". The trigger logic
-- doesn't actually check the count — it awards on any flash ascent. The
-- value of 1 is semantic documentation for the criteria.
INSERT INTO public.badges (name, description, icon_key, criteria_type, criteria_value)
VALUES ('First Flash', 'Flash your first route (complete on first attempt)', 'badge-flash', 'first_flash', 1)
ON CONFLICT (name) DO NOTHING;
