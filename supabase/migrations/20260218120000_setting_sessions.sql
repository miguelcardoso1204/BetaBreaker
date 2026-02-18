-- ===========================================================================
-- Migration: Setting Sessions / Calendar (Step 15.3)
-- ===========================================================================
--
-- Adds route-setting scheduling infrastructure:
--   1. setting_sessions table — one row per setter per date per gym
--   2. RLS policies — setter+ can read, gym_admin+ can write
--   3. Indexes — (gym_id, scheduled_date) for calendar queries, (setter_id) for workload
--   4. get_setter_workload() RPC — groups routes by setter within a date range
--
-- WHY A SEPARATE TABLE?
-- Routes have setter_id and created_at, but no concept of "future work planning."
-- Gym admins need to schedule setters on specific dates (before routes exist)
-- and track whether sessions were completed or cancelled. This table models
-- that planning lifecycle independently of the routes table.
--
-- STATUS LIFECYCLE:
--   planned   → default, the session is scheduled but hasn't happened yet
--   completed → the setter showed up and set routes on that date
--   cancelled → the session was called off (setter unavailable, etc.)
-- ===========================================================================


-- ===========================================================================
-- 1. setting_sessions table
-- ===========================================================================

CREATE TABLE public.setting_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which gym this session is scheduled at
  gym_id          uuid        NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  -- Which setter is assigned to this session
  setter_id       uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- The date the setter is scheduled to work
  scheduled_date  date        NOT NULL,
  -- Optional notes (e.g., "Focus on bouldering wall", "Cover for Alex")
  notes           text,
  -- Lifecycle: planned → completed or cancelled
  status          text        NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'completed', 'cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- One session per setter per gym per date — prevents double-booking
  UNIQUE (gym_id, setter_id, scheduled_date)
);

-- Calendar queries filter by gym + date range — this index makes those fast
CREATE INDEX idx_setting_sessions_gym_date
  ON public.setting_sessions (gym_id, scheduled_date);

-- Workload queries group by setter — this index supports that access pattern
CREATE INDEX idx_setting_sessions_setter
  ON public.setting_sessions (setter_id);


-- ===========================================================================
-- 2. RLS policies
-- ===========================================================================

ALTER TABLE public.setting_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: setters and above can view sessions at their gym.
-- Uses role_rank/get_user_role from the RLS helper functions migration.
-- Setter needs to see the calendar to know when they're scheduled.
CREATE POLICY setting_sessions_select_setter
  ON public.setting_sessions
  FOR SELECT TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('setter')
  );

-- INSERT: only gym_admin+ can schedule setting sessions.
-- Setters shouldn't be able to add themselves to the calendar.
CREATE POLICY setting_sessions_insert_admin
  ON public.setting_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- UPDATE: only gym_admin+ can modify sessions (change status, notes, etc.).
CREATE POLICY setting_sessions_update_admin
  ON public.setting_sessions
  FOR UPDATE TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  )
  WITH CHECK (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- DELETE: only gym_admin+ can remove sessions from the calendar.
CREATE POLICY setting_sessions_delete_admin
  ON public.setting_sessions
  FOR DELETE TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- 3. get_setter_workload() — RPC for setter workload summary
-- ===========================================================================
-- Groups routes by setter_id within a gym + date range, returning a count
-- of routes each setter created. PostgREST can't express GROUP BY natively,
-- so we expose this as an RPC that the client calls via supabase.rpc().
--
-- SECURITY DEFINER: bypasses RLS so the function can read routes regardless
-- of the caller's role. The caller still needs to be authenticated (the
-- RPC is called from the admin screen which is role-gated client-side).
--
-- Returns a table of (setter_id, display_name, route_count) rows sorted
-- by route_count descending — heaviest workload first.

CREATE OR REPLACE FUNCTION public.get_setter_workload(
  p_gym_id      uuid,
  p_start_date  date,
  p_end_date    date
)
RETURNS TABLE (
  setter_id    uuid,
  display_name text,
  route_count  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    r.setter_id,
    p.display_name,
    COUNT(*)::bigint AS route_count
  FROM public.routes r
  JOIN public.profiles p ON p.id = r.setter_id
  WHERE r.gym_id = p_gym_id
    AND r.setter_id IS NOT NULL
    AND r.created_at >= p_start_date
    AND r.created_at < (p_end_date + interval '1 day')
  GROUP BY r.setter_id, p.display_name
  ORDER BY route_count DESC;
$$;
