-- ===========================================================================
-- Migration: Functions & Triggers (Step 2.3)
-- ===========================================================================
-- Adds gamification infrastructure to Beta Breaker:
--   - 4 new tables: badges, user_badges, user_streaks, leaderboard_entries
--   - 1 schema change: routes.consensus_grade column
--   - 4 RLS policies: SELECT-only on new tables (writes via SECURITY DEFINER)
--   - 7 functions: handle_new_user, recompute_streak, check_and_award_badges,
--     check_grade_consensus, compute_leaderboard, on_ascent_insert, on_ascent_delete
--   - 3 triggers: on_auth_user_created, on_ascent_inserted, on_ascent_deleted
--
-- Why SECURITY DEFINER on trigger functions?
-- ──────────────────────────────────────────
-- Trigger functions fire in the context of the authenticated role (the user
-- who performed the INSERT/DELETE). These functions need to write to tables
-- (user_badges, user_streaks, leaderboard_entries) that have NO INSERT/UPDATE
-- policies for the authenticated role. By running as SECURITY DEFINER, the
-- functions execute with the privileges of the function owner (postgres
-- superuser), which bypasses RLS entirely.
--
-- This is safe because:
--   1. Each function only operates on the triggering user's data
--   2. SET search_path = '' prevents search_path hijacking attacks
--   3. All table references are fully qualified (public.table_name)
--   4. The functions are only called by triggers, not directly by users
--
-- Gamification flow:
-- ──────────────────
-- User inserts ascent → on_ascent_insert trigger fires → calls:
--   1. recompute_streak()      — updates weekly climbing streak
--   2. check_and_award_badges() — checks badge criteria and awards if met
--   3. check_grade_consensus()  — updates community grade if ≥5 submissions
--   4. compute_leaderboard()    — recomputes gym leaderboard rankings
--
-- User deletes ascent → on_ascent_delete trigger fires → calls:
--   1. recompute_streak()      — recalculates after removing the ascent
--   2. check_grade_consensus()  — may clear consensus if <5 submissions
--   3. compute_leaderboard()    — recomputes rankings
--   (Badges are NOT revoked on delete — once earned, they're permanent)
-- ===========================================================================


-- ===========================================================================
-- New Tables (4)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. badges — Badge definitions (criteria for earning achievements)
-- ---------------------------------------------------------------------------
-- This is a reference table seeded by admins or migrations. Each row defines
-- a badge with criteria for automatic awarding. The check_and_award_badges()
-- function loops over this table and evaluates each badge's criteria.
--
-- criteria_type + criteria_value together define the awarding rule:
--   - 'first_grade' + 14 = "Send your first route at canonical grade 14 (V5)"
--   - 'total_sends' + 10 = "Complete 10 total successful ascents"
--   - 'streak_weeks' + 4 = "Maintain a 4-week climbing streak"
CREATE TABLE public.badges (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL UNIQUE,
  description    text,
  -- icon_key maps to an icon asset in the app's UI (e.g., 'badge-v5', 'badge-streak')
  icon_key       text        NOT NULL DEFAULT 'badge-default',
  -- The type of criteria to check. Determines which code path runs in
  -- check_and_award_badges(). CHECK constraint ensures only known types.
  criteria_type  text        NOT NULL
    CHECK (criteria_type IN ('first_grade', 'total_sends', 'streak_weeks')),
  -- The numeric threshold for the criteria (e.g., grade 14, 10 sends, 4 weeks)
  criteria_value integer     NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS — only SELECT policy for authenticated users.
-- Badge definitions are read-only for users; management via service_role.
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. user_badges — Junction table tracking which users earned which badges
-- ---------------------------------------------------------------------------
-- Composite PK (user_id, badge_id) prevents duplicate awards. The trigger
-- uses ON CONFLICT DO NOTHING for idempotency — if a user already has the
-- badge, the INSERT silently does nothing instead of throwing an error.
CREATE TABLE public.user_badges (
  user_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  badge_id   uuid        NOT NULL REFERENCES public.badges (id) ON DELETE CASCADE,
  -- When the badge was earned — useful for displaying "Earned on Jan 5, 2026"
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. user_streaks — Tracks weekly (and future monthly) climbing streaks
-- ---------------------------------------------------------------------------
-- Each user has one row per streak_type. The recompute_streak() function
-- upserts this row every time an ascent is inserted or deleted.
--
-- Why store current + longest instead of just computing on the fly?
-- Computing streaks requires scanning ALL ascent dates for a user and doing
-- the gap analysis. By caching the result, reads are O(1) instead of O(n).
-- The trigger keeps it in sync — every ascent change recomputes from scratch.
CREATE TABLE public.user_streaks (
  user_id          uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- 'weekly' is the current implementation. 'monthly' reserved for future use.
  streak_type      text        NOT NULL DEFAULT 'weekly'
    CHECK (streak_type IN ('weekly', 'monthly')),
  -- Length of the current ongoing streak (0 if broken)
  current_streak   integer     NOT NULL DEFAULT 0,
  -- All-time longest streak for this user (never decreases)
  longest_streak   integer     NOT NULL DEFAULT 0,
  -- The date of the last ISO week start that had an ascent.
  -- Used by the client to compute status (active/at_risk/broken) relative to "now".
  last_active_date date,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, streak_type)
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. leaderboard_entries — Cached leaderboard rankings per gym per period
-- ---------------------------------------------------------------------------
-- Pre-computed leaderboard data for fast reads. The compute_leaderboard()
-- function recalculates scores and ranks on every ascent insert/delete.
--
-- Period format: ISO week label like '2026-W06'. Generated from
-- to_char(created_at, 'IYYY-"W"IW') which uses ISO year + ISO week number.
-- This ensures consistent period labeling across year boundaries.
CREATE TABLE public.leaderboard_entries (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     uuid        NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- ISO week period label (e.g., '2026-W06')
  period     text        NOT NULL,
  -- Numeric score computed by the scoring model (currently hardest_grade = MAX grade)
  score      numeric     NOT NULL DEFAULT 0,
  -- 1-based rank using 1224 ranking (tied entries share rank, next skips)
  rank       integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Each user appears at most once per gym per period
  UNIQUE (gym_id, user_id, period)
);

-- Index for the most common query: "show leaderboard for gym X in period Y"
CREATE INDEX idx_leaderboard_gym_period ON public.leaderboard_entries (gym_id, period);

ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- Schema Change: routes.consensus_grade
-- ===========================================================================
-- Community-sourced grade computed from user perceived_grade submissions.
-- NULL until 5+ submissions exist, then set to the median perceived_grade.
-- Uses the same 0-30 integer scale as canonical_grade.
ALTER TABLE public.routes ADD COLUMN consensus_grade integer
  CHECK (consensus_grade >= 0 AND consensus_grade <= 30);


-- ===========================================================================
-- RLS Policies (4 new SELECT-only policies)
-- ===========================================================================
-- All 4 new tables allow authenticated users to read any row (needed for
-- displaying badges, streaks, and leaderboards in the UI). No INSERT/UPDATE/
-- DELETE policies exist — all mutations happen through SECURITY DEFINER
-- trigger functions that bypass RLS.

CREATE POLICY badges_select_authenticated ON public.badges
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY user_badges_select_authenticated ON public.user_badges
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY user_streaks_select_authenticated ON public.user_streaks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY leaderboard_select_authenticated ON public.leaderboard_entries
  FOR SELECT
  TO authenticated
  USING (true);


-- ===========================================================================
-- Function 1: handle_new_user()
-- ===========================================================================
-- Trigger function that fires AFTER INSERT on auth.users.
-- Automatically creates a profile row for the new user so that:
--   1. Users don't need to manually create their profile after signing up
--   2. FK constraints from other tables to profiles are always satisfied
--   3. display_name is pre-populated from the sign-up form (via raw_user_meta_data)
--
-- ON CONFLICT (id) DO NOTHING makes this idempotent — if a profile already
-- exists (e.g., from a migration or manual insert), it silently skips.
-- This prevents errors when existing tests manually INSERT profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert a profile with the same UUID as the auth.users row.
  -- NEW refers to the newly inserted row in auth.users.
  -- The ->> operator extracts a JSON text value (returns NULL if key missing).
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'display_name'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger: fires after every new user is created in Supabase Auth.
-- AFTER INSERT means the auth.users row is committed before this runs,
-- so the FK from profiles to auth.users is satisfied.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ===========================================================================
-- Function 2: recompute_streak(p_user_id uuid)
-- ===========================================================================
-- Recomputes the weekly climbing streak for a user from scratch.
-- Called by both on_ascent_insert and on_ascent_delete triggers.
--
-- Algorithm (mirrors utils/streaks.ts exactly):
-- 1. Get DISTINCT ISO week start dates from the user's ascents
-- 2. Walk the sorted weeks from oldest to newest:
--    - gap = 1 week  → consecutive (run_length++)
--    - gap = 2 weeks → freeze/forgiven (run_length++)
--    - gap >= 3 weeks → break (save longest, reset run to 1)
-- 3. Upsert the result into user_streaks
--
-- Why date_trunc('week', created_at)?
-- Postgres's date_trunc('week', ...) returns the Monday of the ISO week,
-- which matches date-fns's startOfISOWeek(). This ensures the SQL and
-- TypeScript implementations produce identical results.
CREATE OR REPLACE FUNCTION public.recompute_streak(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Array of unique ISO week start dates for this user's ascents
  v_weeks date[];
  -- Loop variables
  v_run_length  integer := 0;
  v_longest     integer := 0;
  v_gap         integer;
  v_last_active date;
  v_i           integer;
BEGIN
  -- Step 1: Get all unique ISO week start dates, sorted ascending.
  -- date_trunc('week', ...) returns Monday 00:00 of each ascent's week.
  -- ::date casts from timestamptz to date (drops time component).
  -- DISTINCT removes duplicates (multiple ascents in the same week).
  SELECT array_agg(DISTINCT date_trunc('week', ra.created_at)::date ORDER BY date_trunc('week', ra.created_at)::date ASC)
  INTO v_weeks
  FROM public.route_ascents ra
  WHERE ra.user_id = p_user_id;

  -- Handle edge case: no ascents at all → streak is 0/0
  IF v_weeks IS NULL OR array_length(v_weeks, 1) IS NULL THEN
    INSERT INTO public.user_streaks (user_id, streak_type, current_streak, longest_streak, last_active_date, updated_at)
    VALUES (p_user_id, 'weekly', 0, 0, NULL, now())
    ON CONFLICT (user_id, streak_type)
    DO UPDATE SET current_streak = 0, longest_streak = 0, last_active_date = NULL, updated_at = now();
    RETURN;
  END IF;

  -- Step 2: Walk the sorted weeks and compute the streak.
  -- Start with the first week as a run of 1.
  v_run_length := 1;
  v_longest := 1;

  FOR v_i IN 2 .. array_length(v_weeks, 1) LOOP
    -- Calculate the gap in weeks between consecutive entries.
    -- Dividing by 7 converts days to weeks. Since both dates are Monday-aligned,
    -- the difference is always a multiple of 7.
    v_gap := (v_weeks[v_i] - v_weeks[v_i - 1]) / 7;

    IF v_gap = 1 THEN
      -- Consecutive week — streak grows normally
      v_run_length := v_run_length + 1;
    ELSIF v_gap = 2 THEN
      -- One missed week — freeze mechanic: streak continues
      -- (The missed week is forgiven, matching the TypeScript logic)
      v_run_length := v_run_length + 1;
    ELSIF v_gap >= 3 THEN
      -- Two or more missed weeks — streak breaks
      -- Save the longest run seen so far, then reset
      IF v_run_length > v_longest THEN
        v_longest := v_run_length;
      END IF;
      v_run_length := 1;
    END IF;
    -- gap = 0 shouldn't happen after DISTINCT, but if it does, we skip it
  END LOOP;

  -- Final longest check (the last run might be the longest)
  IF v_run_length > v_longest THEN
    v_longest := v_run_length;
  END IF;

  -- The last active date is the most recent week start
  v_last_active := v_weeks[array_length(v_weeks, 1)];

  -- Step 3: Upsert into user_streaks.
  -- ON CONFLICT DO UPDATE ensures we always overwrite with fresh data.
  INSERT INTO public.user_streaks (user_id, streak_type, current_streak, longest_streak, last_active_date, updated_at)
  VALUES (p_user_id, 'weekly', v_run_length, v_longest, v_last_active, now())
  ON CONFLICT (user_id, streak_type)
  DO UPDATE SET
    current_streak = EXCLUDED.current_streak,
    longest_streak = EXCLUDED.longest_streak,
    last_active_date = EXCLUDED.last_active_date,
    updated_at = EXCLUDED.updated_at;
END;
$$;


-- ===========================================================================
-- Function 3: check_and_award_badges(p_user_id, p_route_grade, p_ascent_status)
-- ===========================================================================
-- Loops over all badge definitions and checks if the user qualifies for each.
-- Awards badges by inserting into user_badges with ON CONFLICT DO NOTHING.
--
-- Why loop over ALL badges instead of just checking relevant ones?
-- The badges table is small (tens of rows, not thousands), so a full scan
-- is cheap. This approach is simpler to maintain and automatically picks up
-- new badge definitions without code changes.
--
-- Criteria types:
--   - 'first_grade': Does the user have a successful ascent at this grade?
--     We check p_route_grade against criteria_value. The "first" part is
--     handled by ON CONFLICT DO NOTHING — if they already have the badge,
--     the duplicate INSERT is silently ignored.
--
--   - 'total_sends': Has the user accumulated enough total successful ascents?
--     We count flash + send ascents and compare against criteria_value.
--
--   - 'streak_weeks': Does the user's current streak meet the threshold?
--     We read from user_streaks (which was just updated by recompute_streak).
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
    END IF;

  END LOOP;
END;
$$;


-- ===========================================================================
-- Function 4: check_grade_consensus(p_route_id uuid)
-- ===========================================================================
-- Computes the community consensus grade for a route based on user-submitted
-- perceived_grade values.
--
-- Algorithm:
--   1. Count how many ascents have a non-NULL perceived_grade for this route
--   2. If count >= 5: set consensus_grade to the median (50th percentile)
--   3. If count < 5: clear consensus_grade to NULL
--
-- Why percentile_cont(0.5)?
-- This is Postgres's built-in median function. It uses linear interpolation
-- for even-count datasets (e.g., median of [8,10] = 9). For odd counts,
-- it returns the exact middle value. We ROUND the result to an integer
-- since grades are always whole numbers in our 0-30 scale.
--
-- The threshold of 5 prevents a small number of users from setting the
-- consensus. With 5+ votes, the median is statistically more meaningful.
CREATE OR REPLACE FUNCTION public.check_grade_consensus(p_route_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count   bigint;
  v_median  numeric;
BEGIN
  -- Count submissions that have a perceived_grade (NULL means "no opinion")
  SELECT count(*)
  INTO v_count
  FROM public.route_ascents
  WHERE route_id = p_route_id
    AND perceived_grade IS NOT NULL;

  IF v_count >= 5 THEN
    -- Compute median using percentile_cont (a Postgres aggregate function).
    -- WITHIN GROUP (ORDER BY ...) sorts the values before computing the percentile.
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY perceived_grade)
    INTO v_median
    FROM public.route_ascents
    WHERE route_id = p_route_id
      AND perceived_grade IS NOT NULL;

    -- Update the route's consensus_grade with the rounded median
    UPDATE public.routes
    SET consensus_grade = ROUND(v_median)::integer
    WHERE id = p_route_id;
  ELSE
    -- Not enough submissions — clear the consensus grade.
    -- This handles the case where a delete drops the count below 5.
    UPDATE public.routes
    SET consensus_grade = NULL
    WHERE id = p_route_id;
  END IF;
END;
$$;


-- ===========================================================================
-- Function 5: compute_leaderboard(p_gym_id, p_period_start, p_period_end, p_period_label)
-- ===========================================================================
-- Recomputes the leaderboard for a specific gym and time period.
--
-- Scoring model: hardest_grade (MVP)
--   - Score = MAX(canonical_grade) among successful ascents in the period
--   - Only 'flash' and 'send' status count (attempts excluded)
--
-- Ranking: RANK() OVER (ORDER BY score DESC)
--   - Uses standard competition ranking (1224 system)
--   - Tied entries share the same rank; next rank skips positions
--   - Example: scores [15, 15, 10] → ranks [1, 1, 3]
--
-- The function takes explicit period boundaries (start/end timestamps) and
-- a label string. The calling trigger computes these from the ascent's
-- created_at timestamp using ISO week logic.
CREATE OR REPLACE FUNCTION public.compute_leaderboard(
  p_gym_id       uuid,
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_period_label text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Delete existing entries for this gym+period, then re-insert.
  -- This is simpler than trying to upsert each row individually,
  -- especially since the number of users per gym per week is small.
  -- It also handles the case where a user's only ascent is deleted
  -- (their leaderboard entry should be removed, not updated to 0).
  DELETE FROM public.leaderboard_entries
  WHERE gym_id = p_gym_id AND period = p_period_label;

  -- Insert fresh leaderboard entries with computed scores and ranks.
  -- The subquery computes MAX(canonical_grade) per user, then the outer
  -- query assigns ranks using RANK() window function.
  INSERT INTO public.leaderboard_entries (gym_id, user_id, period, score, rank, updated_at)
  SELECT
    p_gym_id,
    scored.user_id,
    p_period_label,
    scored.score,
    -- RANK() assigns 1-based ranks with 1224 semantics:
    -- ties share the same rank, and the next rank skips positions.
    RANK() OVER (ORDER BY scored.score DESC),
    now()
  FROM (
    -- Inner query: compute each user's score for this gym/period.
    -- MAX(r.canonical_grade) = hardest successful climb in the period.
    SELECT
      ra.user_id,
      MAX(r.canonical_grade) AS score
    FROM public.route_ascents ra
    JOIN public.routes r ON r.id = ra.route_id
    WHERE r.gym_id = p_gym_id
      AND ra.status IN ('flash', 'send')
      AND ra.created_at >= p_period_start
      AND ra.created_at < p_period_end
    GROUP BY ra.user_id
  ) AS scored;
END;
$$;


-- ===========================================================================
-- Function 6: on_ascent_insert() — AFTER INSERT trigger on route_ascents
-- ===========================================================================
-- Orchestrates all gamification updates when a new ascent is logged.
-- Calls the four helper functions in the correct order:
--   1. recompute_streak — must run before check_and_award_badges (streak badges)
--   2. check_and_award_badges — checks all badge criteria
--   3. check_grade_consensus — updates community grade if enough votes
--   4. compute_leaderboard — recomputes rankings for the gym/period
--
-- Why a separate orchestrator instead of putting everything in one function?
-- Each helper function is independently testable and reusable. The trigger
-- function just coordinates them. This follows the Single Responsibility
-- Principle — each function does one thing well.
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
  -- Look up the route's gym_id and canonical_grade.
  -- NEW.route_id is the route referenced by the newly inserted ascent.
  SELECT r.gym_id, r.canonical_grade
  INTO v_gym_id, v_route_grade
  FROM public.routes r
  WHERE r.id = NEW.route_id;

  -- Compute the ISO week period for this ascent's timestamp.
  -- date_trunc('week', ...) gives us the Monday 00:00 of the ISO week.
  -- The period ends at the start of the next week (exclusive upper bound).
  -- to_char with IYYY and IW gives the ISO year and week number.
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

  RETURN NEW;
END;
$$;

-- Trigger: fires after every new ascent is logged.
-- FOR EACH ROW means it runs once per inserted row (not once per statement).
CREATE TRIGGER on_ascent_inserted
  AFTER INSERT ON public.route_ascents
  FOR EACH ROW
  EXECUTE FUNCTION public.on_ascent_insert();


-- ===========================================================================
-- Function 7: on_ascent_delete() — AFTER DELETE trigger on route_ascents
-- ===========================================================================
-- Handles gamification updates when an ascent is removed.
-- Similar to on_ascent_insert but:
--   - Does NOT call check_and_award_badges (badges are permanent)
--   - Uses OLD instead of NEW (OLD = the row that was just deleted)
--
-- Why not revoke badges on delete?
-- Product decision: badges represent achievements. Once earned, removing the
-- triggering ascent doesn't un-earn the badge. This prevents frustrating
-- scenarios where a user fixes a typo in an ascent and loses a badge.
CREATE OR REPLACE FUNCTION public.on_ascent_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id       uuid;
  v_period_start timestamptz;
  v_period_end   timestamptz;
  v_period_label text;
  v_profile_exists boolean;
BEGIN
  -- Guard: skip gamification updates if this delete is part of a CASCADE
  -- from a profile/user deletion. When auth.users is deleted, it cascades
  -- to profiles, which cascades to route_ascents. If we try to upsert into
  -- user_streaks or leaderboard_entries for a user whose profile is being
  -- deleted, the FK constraint will fail. Check if the profile still exists.
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = OLD.user_id
  ) INTO v_profile_exists;

  IF NOT v_profile_exists THEN
    RETURN OLD;
  END IF;

  -- Look up the route's gym_id from the deleted ascent.
  -- OLD refers to the row that was just deleted from route_ascents.
  SELECT r.gym_id
  INTO v_gym_id
  FROM public.routes r
  WHERE r.id = OLD.route_id;

  -- If route was also deleted as part of cascade, skip leaderboard update
  IF v_gym_id IS NULL THEN
    PERFORM public.recompute_streak(OLD.user_id);
    RETURN OLD;
  END IF;

  -- Compute the ISO week period for the deleted ascent's timestamp
  v_period_start := date_trunc('week', OLD.created_at);
  v_period_end := v_period_start + interval '7 days';
  v_period_label := to_char(OLD.created_at, 'IYYY-"W"IW');

  -- 1. Recompute streak (ascent removal may shorten or break the streak)
  PERFORM public.recompute_streak(OLD.user_id);

  -- 2. Recheck grade consensus (may clear if count drops below 5)
  PERFORM public.check_grade_consensus(OLD.route_id);

  -- 3. Recompute leaderboard (user's score may decrease)
  PERFORM public.compute_leaderboard(v_gym_id, v_period_start, v_period_end, v_period_label);

  RETURN OLD;
END;
$$;

-- Trigger: fires after every ascent deletion.
CREATE TRIGGER on_ascent_deleted
  AFTER DELETE ON public.route_ascents
  FOR EACH ROW
  EXECUTE FUNCTION public.on_ascent_delete();
