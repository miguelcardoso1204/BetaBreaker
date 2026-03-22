-- ===========================================================================
-- Migration: Remove scoring models — all leaderboards are points-based
-- ===========================================================================
-- Previously leaderboards had three scoring models (hardest_grade, flash_rate,
-- volume). Now all leaderboards use a universal points system:
--   Score = SUM(canonical_grade + 1) for each successful ascent (flash/send)
--
-- This rewards both difficulty and volume — harder routes give more points,
-- and more sends give more total points. V0 = 1 pt, V1 = 3 pts, V5 = 14 pts.
-- The rules text on each leaderboard explains the specific point breakdown.

-- Drop the scoring_model column and its check constraint
ALTER TABLE public.leaderboards
  DROP CONSTRAINT IF EXISTS leaderboards_scoring_model_check;

ALTER TABLE public.leaderboards
  DROP COLUMN IF EXISTS scoring_model;


-- ===========================================================================
-- Rewrite compute_leaderboard() — universal points formula
-- ===========================================================================
-- Score = SUM(canonical_grade + 1) for all successful ascents in the window.
-- Adding 1 ensures V0 routes (canonical_grade = 0) still give 1 point.
CREATE OR REPLACE FUNCTION public.compute_leaderboard(p_leaderboard_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gym_id    uuid;
  v_starts_at timestamptz;
  v_ends_at   timestamptz;
BEGIN
  -- Look up the leaderboard's time window
  SELECT gym_id, starts_at, ends_at
  INTO v_gym_id, v_starts_at, v_ends_at
  FROM public.leaderboards
  WHERE id = p_leaderboard_id;

  IF v_gym_id IS NULL THEN
    RETURN;
  END IF;

  -- Clear and recompute — simpler than upsert and handles deleted ascents
  DELETE FROM public.leaderboard_entries
  WHERE leaderboard_id = p_leaderboard_id;

  -- Universal points formula: SUM(canonical_grade + 1) per user
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
      SUM(r.canonical_grade + 1)::numeric AS score
    FROM public.route_ascents ra
    JOIN public.routes r ON r.id = ra.route_id
    WHERE r.gym_id = v_gym_id
      AND ra.status IN ('flash', 'send')
      AND ra.created_at >= v_starts_at
      AND ra.created_at < v_ends_at
    GROUP BY ra.user_id
  ) AS scored;
END;
$$;


-- ===========================================================================
-- Rewrite RPCs — remove scoring_model from return types
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_gym_leaderboards(uuid, boolean);

CREATE OR REPLACE FUNCTION public.get_gym_leaderboards(
  p_gym_id uuid,
  p_active boolean DEFAULT true
)
RETURNS TABLE (
  id                  uuid,
  name                text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  total_participants  bigint,
  rules               text,
  prizes              text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    lb.id,
    lb.name,
    lb.starts_at,
    lb.ends_at,
    (
      SELECT COUNT(DISTINCT le.user_id)
      FROM public.leaderboard_entries le
      WHERE le.leaderboard_id = lb.id
    ) AS total_participants,
    lb.rules,
    lb.prizes
  FROM public.leaderboards lb
  WHERE lb.gym_id = p_gym_id
    AND CASE
      WHEN p_active THEN lb.ends_at > now()
      ELSE lb.ends_at <= now()
    END
  ORDER BY lb.ends_at DESC;
$$;


DROP FUNCTION IF EXISTS public.get_enrolled_leaderboards(uuid, boolean);

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
  starts_at           timestamptz,
  ends_at             timestamptz,
  rank                integer,
  score               numeric,
  total_participants  bigint,
  rules               text,
  prizes              text
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
    lb.starts_at,
    lb.ends_at,
    le.rank,
    le.score,
    participants.cnt AS total_participants,
    lb.rules,
    lb.prizes
  FROM public.leaderboard_entries le
  JOIN public.leaderboards lb ON lb.id = le.leaderboard_id
  JOIN public.gyms g ON g.id = lb.gym_id
  CROSS JOIN LATERAL (
    SELECT COUNT(DISTINCT le2.user_id) AS cnt
    FROM public.leaderboard_entries le2
    WHERE le2.leaderboard_id = lb.id
  ) participants
  WHERE le.user_id = p_user_id
    AND CASE
      WHEN p_active THEN lb.ends_at > now()
      ELSE lb.ends_at <= now()
    END
  ORDER BY lb.ends_at DESC, g.name ASC;
$$;


-- Recompute all existing leaderboards with the new formula
DO $$
DECLARE
  v_lb record;
BEGIN
  FOR v_lb IN SELECT id FROM public.leaderboards LOOP
    PERFORM public.compute_leaderboard(v_lb.id);
  END LOOP;
END $$;
