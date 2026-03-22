-- ===========================================================================
-- Migration: Add rules and prizes to leaderboards
-- ===========================================================================
-- Gym admins can set optional free-text rules and prizes when creating a
-- leaderboard. Climbers see these as tappable info buttons on the detail view.

-- Add nullable text columns — not all leaderboards will have rules/prizes
ALTER TABLE public.leaderboards
  ADD COLUMN rules text,
  ADD COLUMN prizes text;

-- Drop existing functions first — CREATE OR REPLACE can't change return types
DROP FUNCTION IF EXISTS public.get_gym_leaderboards(uuid, boolean);
DROP FUNCTION IF EXISTS public.get_enrolled_leaderboards(uuid, boolean);

-- Recreate get_gym_leaderboards() with rules/prizes columns
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
    lb.scoring_model,
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

-- Update get_enrolled_leaderboards() to return the new columns
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
    lb.scoring_model,
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

-- Seed rules/prizes on existing leaderboards so there's visible data
UPDATE public.leaderboards SET
  rules = E'1. Only flash and send ascents count\n2. Each route counts once (best attempt)\n3. Ties broken by earliest submission',
  prizes = E'1st: Free month membership\n2nd: Chalk bag + t-shirt\n3rd: Beta Breaker sticker pack'
WHERE id IN (
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000006'
);

UPDATE public.leaderboards SET
  rules = E'1. Log as many sends as possible\n2. Flash and send both count\n3. Each route counts once per day',
  prizes = E'Top 3 get featured on the gym wall of fame'
WHERE id IN (
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-0000-0000-000000000007'
);
