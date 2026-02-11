-- ===========================================================================
-- Migration: Admin Moderation Policies
-- ===========================================================================
-- Adds RLS policies so gym admins can view and resolve content reports
-- from the client side. Previously, admin access was planned for service_role
-- only (Phase 15), but we need client-side admin access now for the
-- moderation queue screen.
--
-- APPROACH:
-- A helper function `is_admin()` checks if the calling user holds a
-- gym_admin or super_admin role at ANY gym. This is intentionally broad —
-- content_reports uses polymorphic target_type/target_id with no gym_id
-- column, so gym-scoped filtering isn't feasible here. Any admin can
-- review any report, which is acceptable for the moderation workflow.
--
-- The function uses SECURITY DEFINER so it can read user_gym_roles
-- regardless of the caller's RLS context. STABLE because it returns
-- the same result within a single statement (no side effects).
-- ===========================================================================

-- Helper: check if the calling user is an admin at any gym
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_gym_roles
    WHERE user_id = (SELECT auth.uid())
      AND role IN ('gym_admin', 'super_admin')
  );
$$;

-- Admins can see ALL reports (not just their own).
-- This is additive — the existing content_reports_select_own policy
-- still lets regular users see their own reports. Postgres ORs
-- permissive policies together, so admins see everything and
-- regular users see only their own.
CREATE POLICY content_reports_select_admin ON public.content_reports
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Admins can update report status (resolve/dismiss).
-- No UPDATE policy existed before — only admins should change report state.
CREATE POLICY content_reports_update_admin ON public.content_reports
  FOR UPDATE TO authenticated
  USING (public.is_admin());
