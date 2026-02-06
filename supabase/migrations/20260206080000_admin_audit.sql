-- ===========================================================================
-- Migration: Admin & Audit Tables (Step 2.8)
-- ===========================================================================
-- Adds 3 tables for audit logging, maintenance tickets, and seasons, plus
-- an auto-audit trigger on routes that logs grade/status/tag changes.
--
-- Why audit logging? (FR-O3)
-- ──────────────────────────
-- Gym admins need to see who changed a route's grade, who updated its
-- status, and when. The audit_log table captures these changes automatically
-- via a SECURITY DEFINER trigger on routes. It's append-only — no one can
-- UPDATE or DELETE audit entries, preserving a tamper-proof history.
--
-- Why maintenance tickets? (FR-I3)
-- ────────────────────────────────
-- Climbers report issues with routes (e.g., "spinning hold on move 3").
-- Setters and gym admins can view and update ticket status. This creates
-- a feedback loop between climbers and gym staff for route quality.
--
-- Why seasons? (FR-I4)
-- ────────────────────
-- Gyms organize their calendars into seasons (e.g., "2026 Spring",
-- "Summer Series"). Seasons provide context for leaderboards and
-- competitions — you can show "Spring Season Rankings" vs "All Time".
--
-- Design decisions:
-- ─────────────────
-- 1. audit_log is append-only. No UPDATE or DELETE policies exist for
--    any role. Only SECURITY DEFINER triggers and service_role can INSERT.
--    Gym admins can only SELECT entries for their gym.
--
-- 2. audit_log.actor_id is nullable (system actions have no actor) and
--    uses ON DELETE SET NULL. When a user is deleted, their audit history
--    is preserved — you can still see "someone changed grade from 12 to 14"
--    even if you can't identify who.
--
-- 3. maintenance_tickets doesn't have a direct gym_id column. The gym is
--    looked up via the route's gym_id using a subquery in RLS policies.
--    This is the same pattern used by event_routes in Step 2.6.
--
-- 4. The on_route_update trigger uses the same SECURITY DEFINER pattern
--    as other trigger functions: SET search_path = '', fully qualified
--    table names, and auth.uid() for the actor (NULL for service_role).
-- ===========================================================================


-- ===========================================================================
-- Table 1: audit_log — Append-only audit trail for gym operations (FR-O3)
-- ===========================================================================
-- Each row records a single auditable change. The polymorphic target_type +
-- target_id pattern lets us audit different entity types (routes, media,
-- feedback) without needing separate audit tables for each.
--
-- The action column categorizes the change type. The old_value and new_value
-- JSONB columns store before/after snapshots so admins can see exactly what
-- changed (e.g., grade went from 12 to 14).
CREATE TABLE public.audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which gym this audit entry belongs to — CASCADE deletes audit history
  -- when the gym itself is removed (no orphaned audit entries)
  gym_id      uuid        NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  -- Who made the change — nullable for system actions (e.g., automated triggers).
  -- SET NULL preserves the audit entry when the actor's profile is deleted.
  actor_id    uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  -- The type of change. CHECK constraint ensures only known actions are logged.
  action      text        NOT NULL CHECK (action IN (
    'grade_change',    -- Route's canonical_grade was modified
    'status_change',   -- Route's status changed (active → retiring_soon → archived)
    'tag_change',      -- Route's color or wall_section was updated
    'media_removed'    -- Media was removed from a route/feedback (future use)
  )),
  -- Polymorphic target: what entity was changed. The target_type + target_id
  -- pair identifies the specific row in a specific table.
  target_type text        NOT NULL CHECK (target_type IN ('route', 'media', 'feedback')),
  -- Polymorphic FK — no DB-level constraint because it references different
  -- tables depending on target_type. Application logic ensures consistency.
  target_id   uuid        NOT NULL,
  -- Before and after state as JSONB. NULL old_value means "created" (no prior state).
  -- NULL new_value means "deleted" (no new state). For changes, both are populated.
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index on gym_id: "Show me all audit entries for this gym" — the primary
-- admin query for reviewing changes across all routes at their gym.
CREATE INDEX idx_audit_log_gym_id ON public.audit_log (gym_id);

-- Composite index on (target_type, target_id): "Show me the change history
-- for this specific route" — used on route detail pages for admin audit trail.
CREATE INDEX idx_audit_log_target ON public.audit_log (target_type, target_id);


-- ===========================================================================
-- Table 2: maintenance_tickets — Route issue reports (FR-I3)
-- ===========================================================================
-- Climbers report problems with routes (loose holds, confusing beta,
-- safety concerns). Setters and gym admins triage and resolve these tickets.
--
-- The status column tracks the ticket lifecycle: open → in_progress → resolved.
-- resolved_by and resolved_at are populated when a setter/admin fixes the issue.
CREATE TABLE public.maintenance_tickets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which route has the issue — CASCADE deletes tickets when route is removed
  -- (if the route is gone, its maintenance tickets are irrelevant)
  route_id    uuid        NOT NULL REFERENCES public.routes (id) ON DELETE CASCADE,
  -- Who reported the issue — CASCADE deletes tickets when reporter is removed
  reporter_id uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- What's wrong — free-form text description (e.g., "Spinning hold on move 3")
  description text        NOT NULL,
  -- Ticket lifecycle: open → in_progress → resolved
  -- Defaults to 'open' when a climber first reports an issue
  status      text        NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',         -- Newly reported, not yet triaged
    'in_progress',  -- A setter is working on it
    'resolved'      -- Issue has been fixed
  )),
  -- Who resolved the ticket — SET NULL preserves resolution history if the
  -- resolver's profile is deleted. Nullable because unresolved tickets have no resolver.
  resolved_by uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- When the ticket was resolved — NULL while still open or in_progress
  resolved_at timestamptz
);

-- Index on route_id: "Show me all tickets for this route" — used on route
-- detail pages and in the setter's maintenance dashboard
CREATE INDEX idx_maintenance_tickets_route_id ON public.maintenance_tickets (route_id);

-- Index on status: "Show me all open tickets" — powers the gym-wide
-- maintenance queue that setters check daily
CREATE INDEX idx_maintenance_tickets_status ON public.maintenance_tickets (status);


-- ===========================================================================
-- Table 3: seasons — Gym season definitions (FR-I4)
-- ===========================================================================
-- Seasons divide the gym's calendar into named periods for leaderboard
-- context and competition grouping. A gym can have multiple seasons
-- (e.g., "2026 Spring", "2026 Summer"). Only gym admins manage seasons.
--
-- The status is either 'active' (currently running or upcoming) or 'closed'
-- (past season, archived for historical reference).
CREATE TABLE public.seasons (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which gym this season belongs to — CASCADE deletes seasons when gym is removed
  gym_id      uuid        NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  -- Human-readable season name (e.g., "2026 Spring", "Summer Series")
  name        text        NOT NULL,
  -- Season date boundaries. end_date > start_date is enforced by CHECK constraint.
  start_date  date        NOT NULL,
  end_date    date        NOT NULL,
  -- Season lifecycle: 'active' while running, 'closed' when past
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',   -- Currently running or upcoming
    'closed'    -- Past season, archived for historical reference
  )),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- end_date must be after start_date — same pattern as events table in Step 2.6
  CHECK (end_date > start_date)
);

-- Index on gym_id: "Show me all seasons for this gym" — used on the gym
-- settings page and for season-based leaderboard filtering
CREATE INDEX idx_seasons_gym_id ON public.seasons (gym_id);


-- ===========================================================================
-- Enable Row Level Security on all 3 tables
-- ===========================================================================
-- With RLS enabled but no policies, only superusers can access the data.
-- This is "secure by default" — we add permissive policies below to grant
-- controlled access based on user roles.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- RLS Policies: audit_log (1 policy — read-only for gym admins)
-- ===========================================================================
-- Audit log is append-only. No INSERT/UPDATE/DELETE policies exist for
-- authenticated users. Only SECURITY DEFINER triggers and service_role
-- can write to this table. Gym admins can only read their gym's entries.

-- SELECT: gym admins (and higher) can view audit entries for their gym.
-- role_rank() >= role_rank('gym_admin') includes gym_admin and super_admin.
CREATE POLICY audit_log_select_gym_admin ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- No INSERT policy: only system writes (SECURITY DEFINER trigger + service_role)
-- No UPDATE policy: audit entries are immutable (append-only)
-- No DELETE policy: audit entries are permanent (tamper-proof history)


-- ===========================================================================
-- RLS Policies: maintenance_tickets (4 policies)
-- ===========================================================================
-- Any authenticated user can report an issue (INSERT with reporter_id = self).
-- Setters+ can view and update tickets for routes at their gym.
-- Only gym admins can delete tickets (cleanup/moderation).
--
-- maintenance_tickets doesn't have a direct gym_id column. The gym is looked
-- up via a subquery on routes — same pattern as event_routes in Step 2.6.

-- SELECT: setters (and higher) can view tickets for routes at their gym.
-- Uses a subquery to resolve route_id → gym_id for the role check.
CREATE POLICY maintenance_tickets_select_setter ON public.maintenance_tickets
  FOR SELECT
  TO authenticated
  USING (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.routes WHERE id = route_id)
      )
    ) >= public.role_rank('setter')
  );

-- INSERT: any authenticated user can report an issue on a route.
-- The reporter_id must match the authenticated user (no filing tickets as someone else).
CREATE POLICY maintenance_tickets_insert_own ON public.maintenance_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- UPDATE: setters (and higher) can update ticket status (e.g., mark as in_progress/resolved).
-- Uses the same route → gym subquery pattern as SELECT.
CREATE POLICY maintenance_tickets_update_setter ON public.maintenance_tickets
  FOR UPDATE
  TO authenticated
  USING (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.routes WHERE id = route_id)
      )
    ) >= public.role_rank('setter')
  );

-- DELETE: only gym admins can delete tickets (cleanup/moderation).
-- More restrictive than UPDATE — deleting tickets is a significant action.
CREATE POLICY maintenance_tickets_delete_gym_admin ON public.maintenance_tickets
  FOR DELETE
  TO authenticated
  USING (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.routes WHERE id = route_id)
      )
    ) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- RLS Policies: seasons (4 policies)
-- ===========================================================================
-- Seasons are publicly readable (needed for leaderboard context — users
-- see "Spring 2026 Rankings"). Only gym admins can create, edit, and
-- delete seasons at their gym.

-- SELECT: any authenticated user can see any season.
-- Seasons are reference data — no privacy concern, needed for UI context.
CREATE POLICY seasons_select_authenticated ON public.seasons
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: only gym admins can create seasons for their gym
CREATE POLICY seasons_insert_gym_admin ON public.seasons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- UPDATE: only gym admins can modify seasons (change name, dates, status)
CREATE POLICY seasons_update_gym_admin ON public.seasons
  FOR UPDATE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- DELETE: only gym admins can remove seasons
CREATE POLICY seasons_delete_gym_admin ON public.seasons
  FOR DELETE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- Trigger Function: on_route_update() — Auto-audit for route changes
-- ===========================================================================
-- Fires AFTER UPDATE on routes. Compares OLD and NEW values for auditable
-- columns and inserts an audit_log row for each detected change.
--
-- Auditable columns:
--   - canonical_grade → action = 'grade_change'
--   - status          → action = 'status_change'
--   - color, wall_section → action = 'tag_change'
--
-- Why SECURITY DEFINER?
-- The trigger fires in the context of the authenticated user who performed
-- the UPDATE. audit_log has no INSERT policy for authenticated users, so
-- the trigger needs elevated privileges to write. SECURITY DEFINER runs
-- the function as the postgres superuser, bypassing RLS.
--
-- Why auth.uid() for actor_id?
-- In a trigger context called by an authenticated user, auth.uid() returns
-- the user's UUID (read from the JWT session variable). If called by
-- service_role (e.g., admin API), auth.uid() returns NULL — which is fine
-- since actor_id is nullable (system actions don't have an actor).
--
-- Why IS DISTINCT FROM instead of !=?
-- The != operator returns NULL when either operand is NULL (SQL three-valued
-- logic). IS DISTINCT FROM treats NULL as a value — NULL IS DISTINCT FROM 'foo'
-- returns TRUE, and NULL IS DISTINCT FROM NULL returns FALSE. This correctly
-- handles the case where color or wall_section goes from NULL to a value.
CREATE OR REPLACE FUNCTION public.on_route_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if canonical_grade changed — log a grade_change audit entry
  IF OLD.canonical_grade IS DISTINCT FROM NEW.canonical_grade THEN
    INSERT INTO public.audit_log (gym_id, actor_id, action, target_type, target_id, old_value, new_value)
    VALUES (
      NEW.gym_id,
      auth.uid(),         -- NULL if called by service_role (system action)
      'grade_change',
      'route',
      NEW.id,
      jsonb_build_object('canonical_grade', OLD.canonical_grade),
      jsonb_build_object('canonical_grade', NEW.canonical_grade)
    );
  END IF;

  -- Check if status changed — log a status_change audit entry
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_log (gym_id, actor_id, action, target_type, target_id, old_value, new_value)
    VALUES (
      NEW.gym_id,
      auth.uid(),
      'status_change',
      'route',
      NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;

  -- Check if color changed — log a tag_change audit entry
  IF OLD.color IS DISTINCT FROM NEW.color THEN
    INSERT INTO public.audit_log (gym_id, actor_id, action, target_type, target_id, old_value, new_value)
    VALUES (
      NEW.gym_id,
      auth.uid(),
      'tag_change',
      'route',
      NEW.id,
      jsonb_build_object('color', OLD.color),
      jsonb_build_object('color', NEW.color)
    );
  END IF;

  -- Check if wall_section changed — log a tag_change audit entry
  IF OLD.wall_section IS DISTINCT FROM NEW.wall_section THEN
    INSERT INTO public.audit_log (gym_id, actor_id, action, target_type, target_id, old_value, new_value)
    VALUES (
      NEW.gym_id,
      auth.uid(),
      'tag_change',
      'route',
      NEW.id,
      jsonb_build_object('wall_section', OLD.wall_section),
      jsonb_build_object('wall_section', NEW.wall_section)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: fires after every route update.
-- FOR EACH ROW means it runs once per updated row (not once per statement).
-- AFTER UPDATE ensures the route change is committed before the audit log
-- entry is created — maintaining consistency.
CREATE TRIGGER on_route_updated
  AFTER UPDATE ON public.routes
  FOR EACH ROW
  EXECUTE FUNCTION public.on_route_update();
