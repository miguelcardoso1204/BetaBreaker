-- Migration: fix_advisor_warnings
-- Fixes three Supabase Advisor warnings:
--   1. role_rank() — missing SET search_path (function_search_path_mutable)
--   2. route_style_tags INSERT — WITH CHECK (true) allows arbitrary vote_count
--   3. route_style_tags UPDATE — USING (true) lets any user overwrite any vote_count
--
-- These were flagged by Supabase's Performance & Security linter.


-- ===========================================================================
-- 1. Pin search_path on role_rank()
-- ===========================================================================
-- Even though role_rank() is a pure CASE expression with no table access,
-- Supabase flags any function without an explicit search_path as a potential
-- search-path hijacking vector. Setting it to empty string is best practice
-- for all functions, especially those used inside RLS policies.
CREATE OR REPLACE FUNCTION public.role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_role
    WHEN 'climber'     THEN 1
    WHEN 'setter'      THEN 2
    WHEN 'judge'       THEN 3
    WHEN 'gym_admin'   THEN 4
    WHEN 'super_admin' THEN 5
    ELSE 0  -- Unknown role gets no access
  END;
$$;


-- ===========================================================================
-- 2. Tighten route_style_tags INSERT policy
-- ===========================================================================
-- Previously: WITH CHECK (true) — any authenticated user could insert a row
-- with an arbitrary vote_count (e.g., INSERT ... vote_count = 999).
--
-- Fix: Require vote_count = 0 on insert. New tag associations always start
-- with zero votes. The vote_count is incremented via controlled triggers or
-- Edge Functions, not direct user UPDATEs.
DROP POLICY route_style_tags_insert_authenticated ON public.route_style_tags;

CREATE POLICY route_style_tags_insert_authenticated ON public.route_style_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (vote_count = 0);


-- ===========================================================================
-- 3. Restrict route_style_tags UPDATE to setters+
-- ===========================================================================
-- Previously: USING (true) — any authenticated user could set any row's
-- vote_count to any value. This effectively bypassed RLS for writes.
--
-- Fix: Only setters and above (at the route's gym) can directly UPDATE rows.
-- This matches the DELETE policy pattern. Vote counting by regular climbers
-- should go through a controlled trigger or Edge Function that uses
-- SECURITY DEFINER, not direct UPDATE access.
DROP POLICY route_style_tags_update_authenticated ON public.route_style_tags;

CREATE POLICY route_style_tags_update_setter ON public.route_style_tags
  FOR UPDATE
  TO authenticated
  USING (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.routes WHERE id = route_id)
      )
    ) >= public.role_rank('setter')
  );
