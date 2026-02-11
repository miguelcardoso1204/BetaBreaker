-- ===========================================================================
-- Migration: Leaderboard Scoring Models (Step 9.1)
-- ===========================================================================
-- Extends the leaderboard system to support multiple scoring models:
--   - hardest_grade: MAX(canonical_grade) — existing behavior
--   - flash_rate:    COUNT(flash) / COUNT(flash+send) — decimal 0.0–1.0
--   - volume:        COUNT(flash+send) — total successful ascents
--
-- Changes:
--   1. Add scoring_model column to leaderboard_entries (NOT NULL, CHECK)
--   2. Update UNIQUE constraint to include scoring_model
--   3. Update index to include scoring_model
--   4. Replace compute_leaderboard() to accept p_scoring_model parameter
--   5. Update on_ascent_insert() to call compute_leaderboard 3x (once per model)
--   6. Update on_ascent_delete() with same 3-call pattern
--   7. Create get_enrolled_leaderboards() — enriched user leaderboard data
--
-- Why multiple scoring models?
-- FR-G1 (PW=4) requires "Leaderboards by hardest grade, flash rate, volume,
-- rank." Different scoring models reward different climbing styles:
--   - hardest_grade rewards pushing limits on tough routes
--   - flash_rate rewards consistency and clean climbing
--   - volume rewards total effort and gym time
-- ===========================================================================


-- ===========================================================================
-- 1. Add scoring_model column
-- ===========================================================================
-- Defaults to 'hardest_grade' so existing rows remain valid. The CHECK
-- constraint restricts values to our three supported models.
ALTER TABLE public.leaderboard_entries
  ADD COLUMN scoring_model text NOT NULL DEFAULT 'hardest_grade';

ALTER TABLE public.leaderboard_entries
  ADD CONSTRAINT leaderboard_scoring_model_check
  CHECK (scoring_model IN ('hardest_grade', 'flash_rate', 'volume'));


-- ===========================================================================
-- 2. Update UNIQUE constraint
-- ===========================================================================
-- The old constraint was (gym_id, user_id, period) — one entry per user per
-- gym per period. Now we need one entry per user per gym per period PER MODEL,
-- since a user has separate scores for each scoring model.
ALTER TABLE public.leaderboard_entries
  DROP CONSTRAINT leaderboard_entries_gym_id_user_id_period_key;

ALTER TABLE public.leaderboard_entries
  ADD CONSTRAINT leaderboard_entries_gym_user_period_model_key
  UNIQUE (gym_id, user_id, period, scoring_model);


-- ===========================================================================
-- 3. Update index for the most common query pattern
-- ===========================================================================
-- The old index was on (gym_id, period). Adding scoring_model lets Postgres
-- efficiently filter when querying "show leaderboard for gym X in period Y
-- using model Z" without scanning extra rows.
DROP INDEX IF EXISTS idx_leaderboard_gym_period;
CREATE INDEX idx_leaderboard_gym_period_model
  ON public.leaderboard_entries (gym_id, period, scoring_model);


-- ===========================================================================
-- 4. Replace compute_leaderboard() — now accepts p_scoring_model
-- ===========================================================================
-- The function now takes a fifth parameter (p_scoring_model) that determines
-- how scores are computed. The DELETE+INSERT pattern stays the same, but is
-- scoped to (gym_id, period, scoring_model) so models don't clobber each other.
--
-- Scoring branches:
--   - hardest_grade: MAX(canonical_grade) — unchanged from before
--   - flash_rate: flash_count / total_sends — decimal 0.0–1.0
--   - volume: COUNT of flash+send ascents
CREATE OR REPLACE FUNCTION public.compute_leaderboard(
  p_gym_id         uuid,
  p_period_start   timestamptz,
  p_period_end     timestamptz,
  p_period_label   text,
  p_scoring_model  text DEFAULT 'hardest_grade'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Delete existing entries for this gym+period+model, then re-insert.
  -- Scoped to scoring_model so other models' entries are untouched.
  DELETE FROM public.leaderboard_entries
  WHERE gym_id = p_gym_id
    AND period = p_period_label
    AND scoring_model = p_scoring_model;

  -- Branch on scoring model to compute different scores
  IF p_scoring_model = 'hardest_grade' THEN
    -- Score = MAX(canonical_grade) among successful ascents in the period.
    -- This rewards climbers who push their limits on the hardest routes.
    INSERT INTO public.leaderboard_entries
      (gym_id, user_id, period, scoring_model, score, rank, updated_at)
    SELECT
      p_gym_id,
      scored.user_id,
      p_period_label,
      'hardest_grade',
      scored.score,
      RANK() OVER (ORDER BY scored.score DESC),
      now()
    FROM (
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

  ELSIF p_scoring_model = 'flash_rate' THEN
    -- Score = flash_count / total_successful_ascents — decimal 0.0–1.0.
    -- This rewards climbers who send routes clean on their first try.
    -- A user who flashes 3 out of 4 sends gets a score of 0.75.
    INSERT INTO public.leaderboard_entries
      (gym_id, user_id, period, scoring_model, score, rank, updated_at)
    SELECT
      p_gym_id,
      scored.user_id,
      p_period_label,
      'flash_rate',
      scored.score,
      RANK() OVER (ORDER BY scored.score DESC),
      now()
    FROM (
      SELECT
        ra.user_id,
        -- NULLIF prevents division by zero (shouldn't happen since we filter
        -- for flash+send, but defensive programming). ROUND to 4 decimal places
        -- for readable scores while preserving enough precision for ranking.
        ROUND(
          COUNT(*) FILTER (WHERE ra.status = 'flash')::numeric
          / NULLIF(COUNT(*)::numeric, 0),
          4
        ) AS score
      FROM public.route_ascents ra
      JOIN public.routes r ON r.id = ra.route_id
      WHERE r.gym_id = p_gym_id
        AND ra.status IN ('flash', 'send')
        AND ra.created_at >= p_period_start
        AND ra.created_at < p_period_end
      GROUP BY ra.user_id
    ) AS scored;

  ELSIF p_scoring_model = 'volume' THEN
    -- Score = COUNT of successful ascents (flash + send).
    -- This rewards gym time and total effort — every send counts equally
    -- regardless of difficulty.
    INSERT INTO public.leaderboard_entries
      (gym_id, user_id, period, scoring_model, score, rank, updated_at)
    SELECT
      p_gym_id,
      scored.user_id,
      p_period_label,
      'volume',
      scored.score,
      RANK() OVER (ORDER BY scored.score DESC),
      now()
    FROM (
      SELECT
        ra.user_id,
        COUNT(*)::numeric AS score
      FROM public.route_ascents ra
      JOIN public.routes r ON r.id = ra.route_id
      WHERE r.gym_id = p_gym_id
        AND ra.status IN ('flash', 'send')
        AND ra.created_at >= p_period_start
        AND ra.created_at < p_period_end
      GROUP BY ra.user_id
    ) AS scored;

  END IF;
END;
$$;


-- ===========================================================================
-- 5. Update on_ascent_insert() — compute all 3 models
-- ===========================================================================
-- Now calls compute_leaderboard once per scoring model. The cost is low since
-- each call processes a small dataset (one gym, one period, one model).
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

  -- Compute ISO week period boundaries for this ascent's timestamp
  v_period_start := date_trunc('week', NEW.created_at);
  v_period_end := v_period_start + interval '7 days';
  v_period_label := to_char(NEW.created_at, 'IYYY-"W"IW');

  -- 1. Recompute streak (must run before badge check for streak_weeks badges)
  PERFORM public.recompute_streak(NEW.user_id);

  -- 2. Check and award any earned badges
  PERFORM public.check_and_award_badges(NEW.user_id, v_route_grade, NEW.status);

  -- 3. Update grade consensus if the climber submitted a perceived grade
  PERFORM public.check_grade_consensus(NEW.route_id);

  -- 4. Recompute leaderboard for ALL 3 scoring models.
  -- Each model produces independent entries — a user can rank differently
  -- in hardest_grade vs flash_rate vs volume for the same gym/period.
  PERFORM public.compute_leaderboard(v_gym_id, v_period_start, v_period_end, v_period_label, 'hardest_grade');
  PERFORM public.compute_leaderboard(v_gym_id, v_period_start, v_period_end, v_period_label, 'flash_rate');
  PERFORM public.compute_leaderboard(v_gym_id, v_period_start, v_period_end, v_period_label, 'volume');

  -- 5. Update progress for any active challenges at this gym (Step 8.4)
  PERFORM public.update_challenge_progress(NEW.user_id, NEW.route_id, NEW.status);

  RETURN NEW;
END;
$$;


-- ===========================================================================
-- 6. Update on_ascent_delete() — recompute all 3 models
-- ===========================================================================
-- Same 3-call pattern as insert. When an ascent is removed, all scoring models
-- need to be recomputed for the affected gym/period.
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
  -- from a profile/user deletion. The FK from leaderboard_entries → profiles
  -- would fail if the profile is being deleted.
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = OLD.user_id
  ) INTO v_profile_exists;

  IF NOT v_profile_exists THEN
    RETURN OLD;
  END IF;

  -- Look up the route's gym_id from the deleted ascent
  SELECT r.gym_id
  INTO v_gym_id
  FROM public.routes r
  WHERE r.id = OLD.route_id;

  -- If route was also deleted as part of cascade, skip leaderboard update
  IF v_gym_id IS NULL THEN
    PERFORM public.recompute_streak(OLD.user_id);
    RETURN OLD;
  END IF;

  -- Compute ISO week period for the deleted ascent's timestamp
  v_period_start := date_trunc('week', OLD.created_at);
  v_period_end := v_period_start + interval '7 days';
  v_period_label := to_char(OLD.created_at, 'IYYY-"W"IW');

  -- 1. Recompute streak (ascent removal may shorten or break the streak)
  PERFORM public.recompute_streak(OLD.user_id);

  -- 2. Recheck grade consensus (may clear if count drops below 5)
  PERFORM public.check_grade_consensus(OLD.route_id);

  -- 3. Recompute leaderboard for ALL 3 scoring models
  PERFORM public.compute_leaderboard(v_gym_id, v_period_start, v_period_end, v_period_label, 'hardest_grade');
  PERFORM public.compute_leaderboard(v_gym_id, v_period_start, v_period_end, v_period_label, 'flash_rate');
  PERFORM public.compute_leaderboard(v_gym_id, v_period_start, v_period_end, v_period_label, 'volume');

  RETURN OLD;
END;
$$;


-- ===========================================================================
-- 7. get_enrolled_leaderboards() — enriched leaderboard data for a user
-- ===========================================================================
-- Returns the user's leaderboard entries joined with gym names and total
-- participant counts. Used by the Leaderboards tab to show the user's
-- standings across all gyms they've competed at.
--
-- Why a server-side function instead of PostgREST queries?
-- This query needs:
--   1. JOIN with gyms for gym_name
--   2. Lateral subquery for total_participants (COUNT DISTINCT per gym/period/model)
--   3. Filtering to only the most recent period per gym per model
-- Doing this in a single RPC call is more efficient than multiple PostgREST
-- round-trips, and the LATERAL join pattern isn't expressible in PostgREST.
--
-- Returns one row per gym per scoring_model — only the most recent period.
-- This means if a user has entries for weeks 5 and 6, only week 6 shows up.
CREATE OR REPLACE FUNCTION public.get_enrolled_leaderboards(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  gym_id uuid,
  gym_name text,
  period text,
  scoring_model text,
  rank integer,
  score numeric,
  total_participants bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Use DISTINCT ON to get only the most recent period per gym per model.
  -- ORDER BY period DESC ensures the most recent week comes first, and
  -- DISTINCT ON picks the first row per (gym_id, scoring_model) group.
  SELECT
    le.id,
    le.gym_id,
    g.name AS gym_name,
    le.period,
    le.scoring_model,
    le.rank,
    le.score,
    participants.cnt AS total_participants
  FROM (
    -- Subquery to get only the latest period per gym per model for this user
    SELECT DISTINCT ON (le2.gym_id, le2.scoring_model)
      le2.id, le2.gym_id, le2.period, le2.scoring_model, le2.rank, le2.score
    FROM public.leaderboard_entries le2
    WHERE le2.user_id = p_user_id
    ORDER BY le2.gym_id, le2.scoring_model, le2.period DESC
  ) le
  -- Join with gyms to get the gym's display name
  JOIN public.gyms g ON g.id = le.gym_id
  -- Lateral subquery: count total participants for this gym/period/model.
  -- LATERAL means this subquery runs once per row in the outer query,
  -- with access to the outer row's columns (le.gym_id, le.period, etc.).
  CROSS JOIN LATERAL (
    SELECT COUNT(DISTINCT le3.user_id) AS cnt
    FROM public.leaderboard_entries le3
    WHERE le3.gym_id = le.gym_id
      AND le3.period = le.period
      AND le3.scoring_model = le.scoring_model
  ) participants
  ORDER BY le.period DESC, g.name ASC;
$$;
