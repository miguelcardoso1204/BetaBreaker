-- ===========================================================================
-- Migration: Add Missing Foreign Key Indexes
-- ===========================================================================
-- Fixes 19 unindexed_foreign_keys warnings from the Supabase Performance Linter.
--
-- Why index foreign keys?
-- ───────────────────────
-- When a parent row is deleted (e.g., a profile), Postgres must check every
-- child table with an ON DELETE CASCADE/SET NULL FK to find referencing rows.
-- Without an index on the FK column, this requires a sequential scan of the
-- entire child table — O(n) per delete. With an index, it's O(log n).
--
-- This matters most for:
--   1. CASCADE deletes (user deletes account → clean up all their data)
--   2. JOINs that filter by the FK column (common in app queries)
--   3. RLS policies that reference FK columns in subqueries
--
-- CREATE INDEX IF NOT EXISTS is used so this migration is idempotent —
-- safe to re-run if some indexes already exist.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- profiles.home_gym_id → gyms(id)
-- Used when: gym is deleted (SET NULL on profiles), querying users at a gym
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_home_gym_id
  ON public.profiles (home_gym_id);


-- ---------------------------------------------------------------------------
-- routes.setter_id → profiles(id)
-- Used when: profile is deleted (SET NULL on routes), querying routes by setter
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_routes_setter_id
  ON public.routes (setter_id);


-- ---------------------------------------------------------------------------
-- route_style_tags.tag_id → style_tags(id)
-- PK is (route_id, tag_id) so route_id leads — tag_id needs its own index
-- Used when: style_tag is deleted (CASCADE), querying routes by tag
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_route_style_tags_tag_id
  ON public.route_style_tags (tag_id);


-- ---------------------------------------------------------------------------
-- route_feedback.user_id → profiles(id)
-- Used when: profile is deleted (CASCADE), querying feedback by author
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_route_feedback_user_id
  ON public.route_feedback (user_id);


-- ---------------------------------------------------------------------------
-- route_feedback_votes.user_id → profiles(id)
-- PK is (feedback_id, user_id) so feedback_id leads — user_id needs its own
-- Used when: profile is deleted (CASCADE), checking "did I already vote?"
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_route_feedback_votes_user_id
  ON public.route_feedback_votes (user_id);


-- ---------------------------------------------------------------------------
-- route_media.user_id → profiles(id)
-- Used when: profile is deleted (CASCADE), querying media by uploader
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_route_media_user_id
  ON public.route_media (user_id);


-- ---------------------------------------------------------------------------
-- content_reports.reporter_id → profiles(id)
-- Used when: profile is deleted (CASCADE), RLS policy filters by reporter_id
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter_id
  ON public.content_reports (reporter_id);

-- ---------------------------------------------------------------------------
-- content_reports.reviewed_by → profiles(id)
-- Used when: reviewer profile is deleted (SET NULL), admin queries by reviewer
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_content_reports_reviewed_by
  ON public.content_reports (reviewed_by);


-- ---------------------------------------------------------------------------
-- events.created_by → profiles(id)
-- Used when: creator profile is deleted (SET NULL), querying events by creator
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_events_created_by
  ON public.events (created_by);


-- ---------------------------------------------------------------------------
-- event_routes.route_id → routes(id)
-- PK is (event_id, route_id) so event_id leads — route_id needs its own
-- Used when: route is deleted (CASCADE), querying which events use a route
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_event_routes_route_id
  ON public.event_routes (route_id);


-- ---------------------------------------------------------------------------
-- competition_scores.category_id → event_categories(id)
-- Used when: category is deleted (SET NULL), filtering scores by category
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_competition_scores_category_id
  ON public.competition_scores (category_id);

-- ---------------------------------------------------------------------------
-- competition_scores.route_id → routes(id)
-- Used when: route is deleted (CASCADE), querying scores for a specific route
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_competition_scores_route_id
  ON public.competition_scores (route_id);

-- ---------------------------------------------------------------------------
-- competition_scores.verified_by → profiles(id)
-- Used when: judge profile is deleted (SET NULL), querying scores by verifier
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_competition_scores_verified_by
  ON public.competition_scores (verified_by);


-- ---------------------------------------------------------------------------
-- leaderboard_entries.user_id → profiles(id)
-- Used when: profile is deleted (CASCADE), querying leaderboard by user
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_user_id
  ON public.leaderboard_entries (user_id);


-- ---------------------------------------------------------------------------
-- maintenance_tickets.reporter_id → profiles(id)
-- Used when: profile is deleted (CASCADE), querying tickets by reporter
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_reporter_id
  ON public.maintenance_tickets (reporter_id);

-- ---------------------------------------------------------------------------
-- maintenance_tickets.resolved_by → profiles(id)
-- Used when: resolver profile is deleted (SET NULL), querying by resolver
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_resolved_by
  ON public.maintenance_tickets (resolved_by);


-- ---------------------------------------------------------------------------
-- saved_routes.route_id → routes(id)
-- Used when: route is deleted (CASCADE), querying who saved a specific route
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_saved_routes_route_id
  ON public.saved_routes (route_id);


-- ---------------------------------------------------------------------------
-- user_badges.badge_id → badges(id)
-- Used when: badge definition is deleted (CASCADE), querying who earned a badge
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id
  ON public.user_badges (badge_id);


-- ---------------------------------------------------------------------------
-- audit_log.actor_id → profiles(id)
-- Used when: actor profile is deleted (SET NULL), querying audit log by actor
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id
  ON public.audit_log (actor_id);
