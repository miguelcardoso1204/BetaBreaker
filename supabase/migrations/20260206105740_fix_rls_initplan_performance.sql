-- ===========================================================================
-- Migration: Fix RLS InitPlan Performance Warnings
-- ===========================================================================
-- Fixes 33 auth_rls_initplan warnings + 1 multiple_permissive_policies warning
-- flagged by the Supabase Performance & Security Linter.
--
-- Problem:
-- ────────
-- When auth.uid() appears directly in a RLS policy's USING or WITH CHECK
-- clause, PostgreSQL treats it as a "correlated subplan" — re-evaluating it
-- for every row the query touches. This is wasteful because auth.uid() reads
-- from a session variable (the JWT) and returns the same value for the
-- entire query.
--
-- Fix:
-- ─────
-- Wrap auth.uid() in a scalar subquery: (SELECT auth.uid()). PostgreSQL
-- recognizes this as an "initplan" — evaluates it once, caches the result,
-- and reuses it for every row. Same result, much less overhead at scale.
--
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Additionally, user_gym_roles has two permissive SELECT policies for the
-- `authenticated` role (roles_select_own + roles_select_gym_admin). Multiple
-- permissive policies on the same table/role/action are OR'd together, but
-- each one must still be evaluated. Merging them into a single policy with
-- an OR condition eliminates the redundant evaluation overhead.
-- ===========================================================================


-- ===========================================================================
-- Table: profiles (3 policies)
-- ===========================================================================

DROP POLICY profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY profiles_delete_own ON public.profiles;
CREATE POLICY profiles_delete_own ON public.profiles
  FOR DELETE
  TO authenticated
  USING (id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: route_ascents (3 policies)
-- ===========================================================================

DROP POLICY ascents_insert_own ON public.route_ascents;
CREATE POLICY ascents_insert_own ON public.route_ascents
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY ascents_update_own ON public.route_ascents;
CREATE POLICY ascents_update_own ON public.route_ascents
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY ascents_delete_own ON public.route_ascents;
CREATE POLICY ascents_delete_own ON public.route_ascents
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: user_gym_roles (merge 2 SELECT policies into 1 + fix initplan)
-- ===========================================================================
-- Previously: two permissive SELECT policies:
--   roles_select_own:       USING (user_id = auth.uid())
--   roles_select_gym_admin: USING (role_rank(get_user_role(gym_id)) >= role_rank('gym_admin'))
--
-- PostgreSQL OR's permissive policies together, but evaluates each one
-- independently for every row. Merging them into a single policy with
-- an explicit OR is functionally identical but avoids the overhead of
-- evaluating two separate policy plans.

DROP POLICY roles_select_own ON public.user_gym_roles;
DROP POLICY roles_select_gym_admin ON public.user_gym_roles;
CREATE POLICY roles_select_own_or_admin ON public.user_gym_roles
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- Table: route_feedback (3 policies)
-- ===========================================================================

DROP POLICY route_feedback_insert_own ON public.route_feedback;
CREATE POLICY route_feedback_insert_own ON public.route_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY route_feedback_update_own ON public.route_feedback;
CREATE POLICY route_feedback_update_own ON public.route_feedback
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY route_feedback_delete_own ON public.route_feedback;
CREATE POLICY route_feedback_delete_own ON public.route_feedback
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: route_feedback_votes (2 policies)
-- ===========================================================================

DROP POLICY feedback_votes_insert_own ON public.route_feedback_votes;
CREATE POLICY feedback_votes_insert_own ON public.route_feedback_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY feedback_votes_delete_own ON public.route_feedback_votes;
CREATE POLICY feedback_votes_delete_own ON public.route_feedback_votes
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: route_media (2 policies)
-- ===========================================================================

DROP POLICY route_media_insert_own ON public.route_media;
CREATE POLICY route_media_insert_own ON public.route_media
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY route_media_delete_own ON public.route_media;
CREATE POLICY route_media_delete_own ON public.route_media
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: content_reports (2 policies)
-- ===========================================================================

DROP POLICY content_reports_insert_own ON public.content_reports;
CREATE POLICY content_reports_insert_own ON public.content_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()));

DROP POLICY content_reports_select_own ON public.content_reports;
CREATE POLICY content_reports_select_own ON public.content_reports
  FOR SELECT
  TO authenticated
  USING (reporter_id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: follows (2 policies)
-- ===========================================================================

DROP POLICY follows_insert_own ON public.follows;
CREATE POLICY follows_insert_own ON public.follows
  FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = (SELECT auth.uid()));

DROP POLICY follows_delete_own ON public.follows;
CREATE POLICY follows_delete_own ON public.follows
  FOR DELETE
  TO authenticated
  USING (follower_id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: competition_scores (1 policy)
-- ===========================================================================

DROP POLICY comp_scores_insert_own_or_judge ON public.competition_scores;
CREATE POLICY comp_scores_insert_own_or_judge ON public.competition_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.events WHERE id = event_id)
      )
    ) >= public.role_rank('judge')
  );


-- ===========================================================================
-- Table: notifications (2 policies)
-- ===========================================================================

DROP POLICY notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: push_tokens (3 policies)
-- ===========================================================================

DROP POLICY push_tokens_select_own ON public.push_tokens;
CREATE POLICY push_tokens_select_own ON public.push_tokens
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY push_tokens_insert_own ON public.push_tokens;
CREATE POLICY push_tokens_insert_own ON public.push_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY push_tokens_delete_own ON public.push_tokens;
CREATE POLICY push_tokens_delete_own ON public.push_tokens
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: notification_preferences (4 policies)
-- ===========================================================================

DROP POLICY notification_prefs_select_own ON public.notification_preferences;
CREATE POLICY notification_prefs_select_own ON public.notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY notification_prefs_insert_own ON public.notification_preferences;
CREATE POLICY notification_prefs_insert_own ON public.notification_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY notification_prefs_update_own ON public.notification_preferences;
CREATE POLICY notification_prefs_update_own ON public.notification_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY notification_prefs_delete_own ON public.notification_preferences;
CREATE POLICY notification_prefs_delete_own ON public.notification_preferences
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: saved_routes (4 policies)
-- ===========================================================================

DROP POLICY saved_routes_select_own ON public.saved_routes;
CREATE POLICY saved_routes_select_own ON public.saved_routes
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY saved_routes_insert_own ON public.saved_routes;
CREATE POLICY saved_routes_insert_own ON public.saved_routes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY saved_routes_update_own ON public.saved_routes;
CREATE POLICY saved_routes_update_own ON public.saved_routes
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY saved_routes_delete_own ON public.saved_routes;
CREATE POLICY saved_routes_delete_own ON public.saved_routes
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ===========================================================================
-- Table: maintenance_tickets (1 policy)
-- ===========================================================================

DROP POLICY maintenance_tickets_insert_own ON public.maintenance_tickets;
CREATE POLICY maintenance_tickets_insert_own ON public.maintenance_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()));
