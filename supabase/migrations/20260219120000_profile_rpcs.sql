-- Migration: Profile RPCs (Step 16.1)
--
-- Three RPCs for the profile screen:
--   1. get_profile_stats(p_user_id) — total sends + max grade for a user
--   2. export_user_data()           — JSONB aggregate of all user data
--   3. delete_own_account()         — deletes auth.users row (CASCADE handles rest)
--
-- WHY RPCs INSTEAD OF CLIENT-SIDE QUERIES?
-- - Stats: A single SQL query is more efficient than downloading all ascent
--   rows to count/max client-side. Postgres does the aggregation.
-- - Export: One atomic read returns everything. No race conditions between
--   multiple sequential queries.
-- - Delete: Requires SECURITY DEFINER to delete from auth.users (which
--   authenticated users can't normally access).

-- ─── get_profile_stats ──────────────────────────────────────────────────
-- Returns total sends (send + flash status) and max canonical grade.
-- Uses SECURITY INVOKER (default) — RLS allows authenticated users to
-- SELECT from route_ascents and routes, so no privilege escalation needed.
--
-- Returns a TABLE so TanStack Query gets a structured result with named
-- columns instead of a single scalar.
CREATE OR REPLACE FUNCTION public.get_profile_stats(p_user_id uuid)
RETURNS TABLE (total_sends bigint, max_grade integer)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT
    COUNT(*)::bigint,
    MAX(r.canonical_grade)
  FROM public.route_ascents ra
  JOIN public.routes r ON r.id = ra.route_id
  WHERE ra.user_id = p_user_id
    AND ra.status IN ('send', 'flash');
$$;

-- ─── export_user_data ───────────────────────────────────────────────────
-- Returns a JSONB object containing the user's profile, ascents, badges,
-- and streak data. SECURITY DEFINER so it can read all tables regardless
-- of RLS — the function scopes everything to auth.uid() internally.
--
-- Why SECURITY DEFINER? Some tables (user_badges, user_streaks) have
-- restrictive SELECT policies. Rather than requiring the client to make
-- 4 separate queries with different auth contexts, this function reads
-- everything in one shot with elevated privileges.
CREATE OR REPLACE FUNCTION public.export_user_data()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'profile', (
      SELECT row_to_json(p)
      FROM public.profiles p
      WHERE p.id = v_uid
    ),
    'ascents', COALESCE(
      (SELECT jsonb_agg(row_to_json(ra))
       FROM public.route_ascents ra
       WHERE ra.user_id = v_uid),
      '[]'::jsonb
    ),
    'badges', COALESCE(
      (SELECT jsonb_agg(row_to_json(ub))
       FROM public.user_badges ub
       WHERE ub.user_id = v_uid),
      '[]'::jsonb
    ),
    'streaks', (
      SELECT row_to_json(us)
      FROM public.user_streaks us
      WHERE us.user_id = v_uid
        AND us.streak_type = 'weekly'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── delete_own_account ─────────────────────────────────────────────────
-- Deletes the caller's auth.users row. CASCADE propagates to profiles,
-- then to route_ascents, user_badges, user_streaks, etc.
--
-- SECURITY DEFINER is required because authenticated users can't DELETE
-- from auth.users directly — that's a Supabase-internal schema.
--
-- The on_ascent_delete trigger already guards against the cascade scenario:
-- it checks EXISTS (SELECT 1 FROM profiles WHERE id = OLD.user_id) before
-- trying to upsert into user_streaks, so it won't fail when the profile
-- is being deleted.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
