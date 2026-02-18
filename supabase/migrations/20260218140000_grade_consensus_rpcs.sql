-- ===========================================================================
-- Migration: Grade Consensus RPCs (Step 15.4)
-- ===========================================================================
-- Two read-only RPCs that power the admin "Grade Consensus" screen.
-- Both query existing tables (routes, route_ascents) — no new tables needed.
--
-- Why RPCs instead of PostgREST queries?
-- PostgREST can't express GROUP BY with computed columns like divergence.
-- RPCs let us return pre-aggregated results in a single round-trip.
--
-- Security model:
-- Both functions use SECURITY INVOKER (default). The underlying tables have
-- SELECT USING (true) for authenticated users, so any logged-in user can
-- call these. The admin screen is client-side route-guarded — the data
-- itself isn't sensitive (route grades are public).
-- ===========================================================================


-- ===========================================================================
-- RPC 1: get_routes_grade_consensus(p_gym_id)
-- ===========================================================================
-- Returns all active/retiring_soon routes at a gym with:
--   - canonical_grade (setter's grade)
--   - consensus_grade (community median, NULL if <5 submissions)
--   - submission_count (number of perceived_grade votes)
--   - divergence (ABS difference, NULL if no consensus)
--
-- Ordered by divergence DESC NULLS LAST so the most "off" routes appear first.
-- This lets admins quickly spot routes where the community disagrees with
-- the setter's grade assignment.
CREATE OR REPLACE FUNCTION public.get_routes_grade_consensus(p_gym_id uuid)
RETURNS TABLE (
  route_id         uuid,
  name             text,
  color            text,
  wall_section     text,
  status           text,
  canonical_grade  integer,
  consensus_grade  integer,
  submission_count bigint,
  divergence       integer
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT
    r.id,
    r.name,
    r.color,
    r.wall_section,
    r.status,
    r.canonical_grade,
    r.consensus_grade,
    -- Count only ascents that include a perceived_grade vote (NULL = no opinion)
    COUNT(ra.perceived_grade)::bigint AS submission_count,
    -- Divergence is only meaningful when consensus exists
    CASE WHEN r.consensus_grade IS NOT NULL
      THEN ABS(r.canonical_grade - r.consensus_grade)
      ELSE NULL
    END AS divergence
  FROM public.routes r
  LEFT JOIN public.route_ascents ra
    ON ra.route_id = r.id AND ra.perceived_grade IS NOT NULL
  WHERE r.gym_id = p_gym_id
    AND r.status IN ('active', 'retiring_soon')
  GROUP BY r.id
  ORDER BY divergence DESC NULLS LAST, r.name ASC;
$$;


-- ===========================================================================
-- RPC 2: get_grade_submissions(p_route_id)
-- ===========================================================================
-- Returns the distribution of perceived_grade submissions for a single route.
-- Each row is a (perceived_grade, count) pair, ordered by grade ascending.
--
-- This powers the drill-down view when an admin taps a route card — they see
-- "3 users think V4, 2 think V5, 1 thinks V6" instead of just the median.
-- More actionable than a single consensus number.
CREATE OR REPLACE FUNCTION public.get_grade_submissions(p_route_id uuid)
RETURNS TABLE (perceived_grade integer, submission_count bigint)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT
    ra.perceived_grade,
    COUNT(*)::bigint AS submission_count
  FROM public.route_ascents ra
  WHERE ra.route_id = p_route_id
    AND ra.perceived_grade IS NOT NULL
  GROUP BY ra.perceived_grade
  ORDER BY ra.perceived_grade ASC;
$$;
