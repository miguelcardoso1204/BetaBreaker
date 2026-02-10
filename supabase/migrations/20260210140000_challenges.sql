-- ===========================================================================
-- Migration: Time-Boxed Challenges & Quests (Step 8.4)
-- ===========================================================================
-- Adds gym-scoped, time-boxed challenges — casual gamification goals like
-- "Send 10 V3+ routes this week" that gym admins create and users
-- automatically progress toward via the existing ascent triggers.
--
-- Changes:
--   1. CREATE TABLE challenges — gym-scoped challenge definitions
--   2. CREATE TABLE user_challenge_progress — per-user progress tracking
--   3. Expand badges CHECK constraint to include 'challenge' criteria type
--   4. Update check_and_award_badges() with no-op 'challenge' branch
--   5. CREATE FUNCTION update_challenge_progress() — SECURITY DEFINER
--   6. Update on_ascent_insert() to call update_challenge_progress()
--   7. RLS policies for both new tables
--
-- Key distinction from competitions (events table):
-- ─────────────────────────────────────────────────
-- Challenges are casual gamification with simple criteria and auto-tracked
-- progress. Competitions (FR-H1–H5) are formal events with categories,
-- scoring models, and judge verification. The events table handles
-- competitions; challenges have their own dedicated tables.
--
-- Design decisions:
-- - Trigger-based auto-progress: Matches existing badge/streak pattern.
--   update_challenge_progress() runs inside on_ascent_insert(), keeping all
--   gamification updates atomic.
-- - SECURITY DEFINER for progress writes: user_challenge_progress has
--   SELECT-only RLS. The trigger bypasses RLS to upsert, preventing users
--   from manually setting progress.
-- - JSONB criteria with Zod validation: Flexible schema without DB
--   migrations for new criteria types. Zod validates client-side; the
--   trigger parses JSONB server-side.
-- ===========================================================================


-- ===========================================================================
-- Table 1: challenges — Gym-scoped challenge definitions
-- ===========================================================================
-- Each challenge belongs to a gym, has a time window (start_date to end_date),
-- criteria defining the goal (JSONB), and an optional reward badge.
-- Gym admins create these via the admin portal.
CREATE TABLE public.challenges (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which gym this challenge belongs to. CASCADE ensures cleanup on gym delete.
  gym_id           uuid        NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  -- Human-readable challenge name, e.g., "Flash Five Challenge"
  name             text        NOT NULL,
  -- Optional description with details, e.g., "Flash 5 different routes this week"
  description      text,
  -- JSONB criteria defining the challenge goal. Validated by Zod client-side.
  -- Structure: { type: string, target: number, min_grade?: number }
  -- See utils/challengeCriteria.ts for the full schema.
  criteria         jsonb       NOT NULL,
  -- Optional badge awarded on completion. SET NULL if the badge is deleted
  -- (the challenge continues to work, just without a reward badge).
  reward_badge_id  uuid        REFERENCES public.badges (id) ON DELETE SET NULL,
  -- Time window — the challenge is only active between these timestamps.
  -- The CHECK constraint ensures end_date is always after start_date.
  start_date       timestamptz NOT NULL,
  end_date         timestamptz NOT NULL,
  -- Who created the challenge. SET NULL if the creator's profile is deleted.
  created_by       uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Prevent invalid date ranges (end must be after start)
  CHECK (end_date > start_date)
);

-- Index for filtering challenges by gym (the primary query pattern)
CREATE INDEX idx_challenges_gym_id ON public.challenges (gym_id);

-- Index for finding active challenges by date range
CREATE INDEX idx_challenges_dates ON public.challenges (start_date, end_date);

-- Enable RLS — policies defined below
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- Table 2: user_challenge_progress — Per-user progress toward challenges
-- ===========================================================================
-- Tracks how far each user has progressed toward each challenge. Composite
-- PK (user_id, challenge_id) ensures one progress row per user per challenge.
-- Only written to by the SECURITY DEFINER trigger — no direct user writes.
CREATE TABLE public.user_challenge_progress (
  -- The user working on this challenge
  user_id       uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- Which challenge this progress is for
  challenge_id  uuid        NOT NULL REFERENCES public.challenges (id) ON DELETE CASCADE,
  -- Current progress count (e.g., 7 out of 10 sends)
  progress      integer     NOT NULL DEFAULT 0 CHECK (progress >= 0),
  -- Set to now() when progress >= target. NULL while still in progress.
  completed_at  timestamptz,
  -- Last time progress was updated (useful for debugging)
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, challenge_id)
);

-- Index for looking up all progress for a specific challenge
CREATE INDEX idx_ucp_challenge_id ON public.user_challenge_progress (challenge_id);

-- Enable RLS — policies defined below
ALTER TABLE public.user_challenge_progress ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- RLS Policies — challenges table
-- ===========================================================================
-- Challenges are readable by all authenticated users (they need to see what
-- challenges are available). Only gym admins can create/modify/delete them.

-- SELECT: All authenticated users can see all challenges.
-- Users browse challenges from any gym, so no user-specific filtering needed.
CREATE POLICY challenges_select_authenticated ON public.challenges
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Only gym admins (and above) can create challenges.
-- Uses the same role hierarchy pattern as other gym-scoped tables.
CREATE POLICY challenges_insert_gym_admin ON public.challenges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- UPDATE: Only gym admins can modify challenges (change dates, criteria, etc.)
CREATE POLICY challenges_update_gym_admin ON public.challenges
  FOR UPDATE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- DELETE: Only gym admins can remove challenges.
CREATE POLICY challenges_delete_gym_admin ON public.challenges
  FOR DELETE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- RLS Policies — user_challenge_progress table
-- ===========================================================================
-- Progress is readable by all authenticated users (needed for leaderboard-style
-- views of who completed challenges). No INSERT/UPDATE/DELETE — all writes
-- happen via the SECURITY DEFINER trigger function.

-- SELECT: All authenticated users can read any progress row.
CREATE POLICY ucp_select_authenticated ON public.user_challenge_progress
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — writes only via SECURITY DEFINER trigger.
-- This prevents users from manually setting their progress or completion state.


-- ===========================================================================
-- Expand badges CHECK constraint to include 'challenge'
-- ===========================================================================
-- Challenge-type badges are awarded by the update_challenge_progress() function
-- when a user completes a challenge with a reward_badge_id set. The
-- check_and_award_badges() function gets a no-op branch for this type since
-- challenge badges are awarded by the challenge-specific logic, not the
-- general badge-checking loop.

ALTER TABLE public.badges
  DROP CONSTRAINT IF EXISTS badges_criteria_type_check;

ALTER TABLE public.badges
  ADD CONSTRAINT badges_criteria_type_check
  CHECK (criteria_type IN ('first_grade', 'total_sends', 'streak_weeks', 'first_flash', 'challenge'));


-- ===========================================================================
-- Update check_and_award_badges() — add no-op 'challenge' branch
-- ===========================================================================
-- When the badge loop encounters a challenge-type badge, it should skip it.
-- Challenge badges are awarded by update_challenge_progress(), not by the
-- general ascent-triggered badge check. Without this branch, the loop would
-- silently skip challenge badges (they'd fall through the IF/ELSIF chain),
-- but an explicit no-op branch documents the intention clearly.
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
      IF p_route_grade = v_badge.criteria_value THEN
        INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (p_user_id, v_badge.id)
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;

    ELSIF v_badge.criteria_type = 'total_sends' THEN
      -- Count all successful ascents for this user
      SELECT count(*)
      INTO v_total_sends
      FROM public.route_ascents
      WHERE user_id = p_user_id
        AND status IN ('flash', 'send');

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

      IF v_current_streak IS NOT NULL AND v_current_streak >= v_badge.criteria_value THEN
        INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (p_user_id, v_badge.id)
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;

    ELSIF v_badge.criteria_type = 'first_flash' THEN
      -- Award when the user logs their first flash
      IF p_ascent_status = 'flash' THEN
        INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (p_user_id, v_badge.id)
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;

    ELSIF v_badge.criteria_type = 'challenge' THEN
      -- No-op: challenge badges are awarded by update_challenge_progress(),
      -- not by the general badge-checking loop. This branch prevents the
      -- badge from being silently skipped without documentation.
      NULL;
    END IF;

  END LOOP;
END;
$$;


-- ===========================================================================
-- Function: update_challenge_progress(p_user_id, p_route_id, p_ascent_status)
-- ===========================================================================
-- Called by on_ascent_insert() to update progress for any active challenges
-- at the ascent's gym. For each active challenge, computes progress from
-- route_ascents based on the challenge's criteria type, then upserts into
-- user_challenge_progress. On completion, awards the reward badge if set.
--
-- SECURITY DEFINER: Needed because user_challenge_progress has no INSERT/
-- UPDATE RLS policies. Only this trigger function can write to it.
--
-- Why compute from scratch each time instead of incrementing?
-- Incrementing would be faster (O(1) vs O(n)), but recomputing from scratch
-- is simpler and handles edge cases like ascent deletion/modification without
-- needing a separate decrement path. The number of ascents per user per
-- challenge period is typically small (tens, not thousands).
CREATE OR REPLACE FUNCTION public.update_challenge_progress(
  p_user_id uuid,
  p_route_id uuid,
  p_ascent_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id        uuid;
  v_challenge     RECORD;
  v_progress      integer;
  v_target        integer;
  v_criteria_type text;
  v_min_grade     integer;
  v_existing      RECORD;
BEGIN
  -- Look up the gym for this route (needed to find relevant challenges)
  SELECT r.gym_id INTO v_gym_id
  FROM public.routes r
  WHERE r.id = p_route_id;

  -- If route not found (shouldn't happen, but guard against it), exit
  IF v_gym_id IS NULL THEN
    RETURN;
  END IF;

  -- Loop through all active challenges for this gym.
  -- A challenge is "active" when now() falls between start_date and end_date.
  FOR v_challenge IN
    SELECT c.id, c.criteria, c.reward_badge_id
    FROM public.challenges c
    WHERE c.gym_id = v_gym_id
      AND now() >= c.start_date
      AND now() < c.end_date
  LOOP
    -- Parse criteria from JSONB
    v_criteria_type := v_challenge.criteria ->> 'type';
    v_target := (v_challenge.criteria ->> 'target')::integer;
    v_min_grade := (v_challenge.criteria ->> 'min_grade')::integer;  -- NULL if not present

    -- Compute progress based on criteria type.
    -- Each query counts qualifying ascents for this user at this gym
    -- during the challenge period. We filter by gym via the routes table.
    IF v_criteria_type = 'send_count' THEN
      -- Count total successful ascents (flash + send)
      SELECT count(*)::integer INTO v_progress
      FROM public.route_ascents ra
      JOIN public.routes r ON r.id = ra.route_id
      WHERE ra.user_id = p_user_id
        AND r.gym_id = v_gym_id
        AND ra.status IN ('flash', 'send');

    ELSIF v_criteria_type = 'flash_count' THEN
      -- Count only flash ascents
      SELECT count(*)::integer INTO v_progress
      FROM public.route_ascents ra
      JOIN public.routes r ON r.id = ra.route_id
      WHERE ra.user_id = p_user_id
        AND r.gym_id = v_gym_id
        AND ra.status = 'flash';

    ELSIF v_criteria_type = 'unique_routes' THEN
      -- Count distinct routes with at least one successful ascent
      SELECT count(DISTINCT ra.route_id)::integer INTO v_progress
      FROM public.route_ascents ra
      JOIN public.routes r ON r.id = ra.route_id
      WHERE ra.user_id = p_user_id
        AND r.gym_id = v_gym_id
        AND ra.status IN ('flash', 'send');

    ELSIF v_criteria_type = 'grade_sends' THEN
      -- Count successful ascents at or above the minimum grade
      SELECT count(*)::integer INTO v_progress
      FROM public.route_ascents ra
      JOIN public.routes r ON r.id = ra.route_id
      WHERE ra.user_id = p_user_id
        AND r.gym_id = v_gym_id
        AND ra.status IN ('flash', 'send')
        AND r.canonical_grade >= v_min_grade;

    ELSE
      -- Unknown criteria type — skip this challenge
      CONTINUE;
    END IF;

    -- Check if the user already has a progress row for this challenge
    SELECT ucp.progress, ucp.completed_at INTO v_existing
    FROM public.user_challenge_progress ucp
    WHERE ucp.user_id = p_user_id
      AND ucp.challenge_id = v_challenge.id;

    -- Skip if already completed (don't re-award badge)
    IF v_existing.completed_at IS NOT NULL THEN
      CONTINUE;
    END IF;

    -- Upsert progress into user_challenge_progress.
    -- ON CONFLICT handles the case where a row already exists.
    IF v_progress >= v_target THEN
      -- Challenge completed! Set completed_at and upsert final progress.
      INSERT INTO public.user_challenge_progress (user_id, challenge_id, progress, completed_at, updated_at)
      VALUES (p_user_id, v_challenge.id, v_progress, now(), now())
      ON CONFLICT (user_id, challenge_id) DO UPDATE SET
        progress = EXCLUDED.progress,
        completed_at = EXCLUDED.completed_at,
        updated_at = EXCLUDED.updated_at;

      -- Award reward badge if the challenge has one
      IF v_challenge.reward_badge_id IS NOT NULL THEN
        INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (p_user_id, v_challenge.reward_badge_id)
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;
    ELSE
      -- Still in progress — upsert current count
      INSERT INTO public.user_challenge_progress (user_id, challenge_id, progress, updated_at)
      VALUES (p_user_id, v_challenge.id, v_progress, now())
      ON CONFLICT (user_id, challenge_id) DO UPDATE SET
        progress = EXCLUDED.progress,
        updated_at = EXCLUDED.updated_at;
    END IF;

  END LOOP;
END;
$$;


-- ===========================================================================
-- Update on_ascent_insert() — add challenge progress call
-- ===========================================================================
-- Extends the existing trigger orchestrator to also call
-- update_challenge_progress() after the leaderboard computation.
-- This keeps all gamification updates atomic within the same transaction.
CREATE OR REPLACE FUNCTION public.on_ascent_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id       uuid;
  v_route_grade  integer;
  v_period_start timestamptz;
  v_period_end   timestamptz;
  v_period_label text;
BEGIN
  -- Look up the route's gym_id and canonical_grade
  SELECT r.gym_id, r.canonical_grade
  INTO v_gym_id, v_route_grade
  FROM public.routes r
  WHERE r.id = NEW.route_id;

  -- Compute the ISO week period for leaderboard
  v_period_start := date_trunc('week', NEW.created_at);
  v_period_end := v_period_start + interval '7 days';
  v_period_label := to_char(NEW.created_at, 'IYYY-"W"IW');

  -- 1. Recompute streak (must run before badge check for streak_weeks badges)
  PERFORM public.recompute_streak(NEW.user_id);

  -- 2. Check and award any earned badges
  PERFORM public.check_and_award_badges(NEW.user_id, v_route_grade, NEW.status);

  -- 3. Update grade consensus if the climber submitted a perceived grade
  PERFORM public.check_grade_consensus(NEW.route_id);

  -- 4. Recompute leaderboard for this gym and period
  PERFORM public.compute_leaderboard(v_gym_id, v_period_start, v_period_end, v_period_label);

  -- 5. Update progress for any active challenges at this gym (Step 8.4)
  PERFORM public.update_challenge_progress(NEW.user_id, NEW.route_id, NEW.status);

  RETURN NEW;
END;
$$;
