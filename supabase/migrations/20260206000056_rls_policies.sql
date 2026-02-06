-- ===========================================================================
-- Migration: Row Level Security Policies (Step 2.2)
-- ===========================================================================
-- Adds 2 helper functions and 23 RLS policies across all 7 core tables.
--
-- How RLS works in Supabase:
-- ─────────────────────────
-- When PostgREST receives an HTTP request, it connects to Postgres as either
-- the `anon` role (no JWT) or `authenticated` role (valid JWT). RLS policies
-- are evaluated against the current role and user identity (auth.uid()).
--
-- Each policy has:
--   - USING clause:      filters which existing rows you can see/modify
--   - WITH CHECK clause: validates which new row values you can insert/update
--
-- Multiple SELECT policies on the same table are OR'd — if ANY policy allows
-- the row, it's visible. This lets us combine "see your own" + "admin sees all".
--
-- Design decisions:
-- - get_user_role() is SECURITY DEFINER: it needs to read user_gym_roles,
--   which itself has RLS. Without SECURITY DEFINER, this creates a circular
--   dependency (policies → function → table with policies). Mitigated with
--   SET search_path = '' and fully-qualified table references.
-- - role_rank() maps role strings to integers for hierarchy comparisons.
--   Instead of listing all qualifying roles in every policy, we compare
--   ranks: role_rank(get_user_role(gym_id)) >= role_rank('setter').
-- - No INSERT/DELETE policies on gyms for authenticated users. Gym creation
--   and deletion happen via Edge Functions using service_role (bypasses RLS).
--   The first gym_admin must also be assigned via service_role (bootstrap).
-- - Route visibility includes 'retiring_soon' — users need to know when
--   routes are about to be removed so they can get final sends in.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Helper Function: role_rank(role text) → integer
-- ---------------------------------------------------------------------------
-- Maps role names to numeric values for hierarchy comparisons.
-- Higher number = more privilege. Unknown roles return 0 (no access).
--
-- This matches the ROLES array in lib/constants.ts exactly:
--   climber(1) < setter(2) < judge(3) < gym_admin(4) < super_admin(5)
--
-- IMMUTABLE tells Postgres this function always returns the same output for
-- the same input — it has no side effects and reads no tables. This lets
-- Postgres optimize queries by caching results and inlining the function.
CREATE OR REPLACE FUNCTION public.role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
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


-- ---------------------------------------------------------------------------
-- Helper Function: get_user_role(p_gym_id uuid) → text
-- ---------------------------------------------------------------------------
-- Returns the calling user's role at a specific gym, or NULL if they have
-- no role there. Uses auth.uid() to identify the caller (reads from the
-- JWT claim set by PostgREST).
--
-- SECURITY DEFINER: This function runs with the privileges of the user who
-- CREATED it (postgres superuser), not the user who CALLS it. This is
-- necessary because user_gym_roles has its own RLS policies, creating a
-- circular dependency:
--   RLS policy on routes → calls get_user_role() → reads user_gym_roles → blocked by RLS
--
-- By running as the definer (superuser), it bypasses RLS on user_gym_roles.
-- This is safe because:
--   1. The function only returns the CALLER's own role (auth.uid())
--   2. SET search_path = '' prevents search_path hijacking attacks
--   3. All table references are fully qualified (public.user_gym_roles)
--
-- STABLE means the function reads data but doesn't modify it, and will
-- return the same result within a single SQL statement.
CREATE OR REPLACE FUNCTION public.get_user_role(p_gym_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.user_gym_roles
  WHERE user_id = auth.uid()
    AND gym_id = p_gym_id;
$$;


-- ===========================================================================
-- Policies: profiles (4 policies)
-- ===========================================================================
-- All authenticated users can read all profiles (needed for leaderboards,
-- social features, and displaying climbing partners). Users can only
-- modify their own profile.

-- SELECT: any authenticated user can read any profile
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: users can only create their own profile (id must match auth.uid())
-- In practice, profiles are created by the handle_new_user() trigger (Step 2.3),
-- but this policy allows manual creation during onboarding if needed.
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- UPDATE: users can only modify their own profile row.
-- USING (id = auth.uid()) filters to show only your row.
-- WITH CHECK (id = auth.uid()) prevents changing the id column to another user.
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- DELETE: users can delete their own profile (account deletion flow)
CREATE POLICY profiles_delete_own ON public.profiles
  FOR DELETE
  TO authenticated
  USING (id = auth.uid());


-- ===========================================================================
-- Policies: gyms (2 policies)
-- ===========================================================================
-- Gyms are publicly browsable by all authenticated users (to find nearby gyms).
-- Only gym_admin+ can update gym settings (name, address, grade system).
-- No INSERT/DELETE for authenticated — gym lifecycle is managed via Edge Functions
-- using service_role, which bypasses RLS entirely.

-- SELECT: browse all gyms
CREATE POLICY gyms_select_authenticated ON public.gyms
  FOR SELECT
  TO authenticated
  USING (true);

-- UPDATE: only gym_admin or higher can change gym settings.
-- The gym's own id is used as the gym_id for the role lookup, because the
-- gyms table doesn't have a gym_id column — it IS the gym.
CREATE POLICY gyms_update_gym_admin ON public.gyms
  FOR UPDATE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(id)) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- Policies: routes (4 policies)
-- ===========================================================================
-- Regular users see active + retiring_soon routes. Setters+ see archived too.
-- Only setters+ can create/update routes. Only gym_admin+ can delete routes.

-- SELECT: authenticated users see active + retiring_soon routes globally.
-- Setters+ at a gym also see that gym's archived routes (for management).
-- The OR means: if either condition is true, the row is visible.
CREATE POLICY routes_select_authenticated ON public.routes
  FOR SELECT
  TO authenticated
  USING (
    status IN ('active', 'retiring_soon')
    OR public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('setter')
  );

-- INSERT: only setters or higher can create routes at their gym.
-- WITH CHECK validates the gym_id matches a gym where the user has setter+ role.
CREATE POLICY routes_insert_setter ON public.routes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('setter')
  );

-- UPDATE: setters+ can modify routes at their gym (change status, grade, etc.)
CREATE POLICY routes_update_setter ON public.routes
  FOR UPDATE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('setter')
  );

-- DELETE: only gym_admin+ can permanently remove routes.
-- Setters can archive (UPDATE status), but only admins can DELETE.
-- This prevents accidental data loss.
CREATE POLICY routes_delete_gym_admin ON public.routes
  FOR DELETE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- Policies: route_ascents (4 policies)
-- ===========================================================================
-- Ascents are publicly readable (leaderboards, social feed).
-- Users can only create/modify/delete their own ascents.

-- SELECT: all ascents visible to authenticated users (needed for leaderboards,
-- friend activity, route popularity counts, etc.)
CREATE POLICY ascents_select_authenticated ON public.route_ascents
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: users can only log ascents for themselves.
-- Prevents one user from logging climbs as another user (spoofing).
CREATE POLICY ascents_insert_own ON public.route_ascents
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: users can only edit their own ascent logs (fix typos, update notes)
CREATE POLICY ascents_update_own ON public.route_ascents
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- DELETE: users can only delete their own ascent logs
CREATE POLICY ascents_delete_own ON public.route_ascents
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ===========================================================================
-- Policies: user_gym_roles (5 policies)
-- ===========================================================================
-- This is the authorization table itself — it controls who has what role at
-- which gym. Access is tightly controlled:
-- - Users can see their own role (so the UI knows what to show/hide)
-- - Gym admins can see all roles at their gym (staff management screen)
-- - Only gym admins can assign/change/remove roles at their gym
--
-- The first gym_admin at a new gym must be assigned via service_role
-- (Edge Function or Supabase dashboard) since there's no existing admin
-- to authorize the assignment. This is the "bootstrap" problem.

-- SELECT (own): users can see their own role assignments.
-- This lets the app check "am I a setter at this gym?" for UI decisions.
CREATE POLICY roles_select_own ON public.user_gym_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- SELECT (admin): gym admins can see all role assignments at their gym.
-- Combined with roles_select_own via OR — admins see own + all gym roles.
CREATE POLICY roles_select_gym_admin ON public.user_gym_roles
  FOR SELECT
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- INSERT: only gym admins can assign roles at their gym.
-- This is how admins onboard setters and judges.
CREATE POLICY roles_insert_gym_admin ON public.user_gym_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- UPDATE: only gym admins can change roles (e.g., promote setter to judge)
CREATE POLICY roles_update_gym_admin ON public.user_gym_roles
  FOR UPDATE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- DELETE: only gym admins can remove role assignments at their gym
CREATE POLICY roles_delete_gym_admin ON public.user_gym_roles
  FOR DELETE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- Policies: style_tags (1 policy)
-- ===========================================================================
-- Style tags are a reference table (like "crimpy", "slab", "overhang").
-- All authenticated users can read them for route browsing and voting.
-- No INSERT/UPDATE/DELETE for authenticated — tag management is done via
-- service_role (admin tools or seed data).

CREATE POLICY style_tags_select_authenticated ON public.style_tags
  FOR SELECT
  TO authenticated
  USING (true);


-- ===========================================================================
-- Policies: route_style_tags (4 policies)
-- ===========================================================================
-- The junction table between routes and style_tags, with a vote_count.
-- - All authenticated users can read tag associations (route detail screen)
-- - All authenticated users can INSERT (voting on tags) and UPDATE (vote count)
-- - Only setters+ can DELETE tag associations (removing incorrect tags)

-- SELECT: anyone can see which tags are associated with which routes
CREATE POLICY route_style_tags_select_authenticated ON public.route_style_tags
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: any authenticated user can vote by inserting a tag association.
-- The composite PK (route_id, tag_id) prevents duplicate votes.
CREATE POLICY route_style_tags_insert_authenticated ON public.route_style_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: any authenticated user can update vote counts.
-- In practice, this is done via a trigger or Edge Function, but the policy
-- allows it for flexibility.
CREATE POLICY route_style_tags_update_authenticated ON public.route_style_tags
  FOR UPDATE
  TO authenticated
  USING (true);

-- DELETE: only setters+ can remove tag associations from routes.
-- We need to look up the gym_id from the routes table using a subquery,
-- because route_style_tags doesn't have a direct gym_id column.
CREATE POLICY route_style_tags_delete_setter ON public.route_style_tags
  FOR DELETE
  TO authenticated
  USING (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.routes WHERE id = route_id)
      )
    ) >= public.role_rank('setter')
  );
