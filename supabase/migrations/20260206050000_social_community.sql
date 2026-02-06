-- ===========================================================================
-- Migration: Social & Community Tables (Step 2.5)
-- ===========================================================================
-- Adds 5 tables for the social layer: beta tips, media uploads, voting,
-- content reporting (moderation), and follow relationships.
--
-- Why a social layer?
-- ───────────────────
-- Climbing is inherently social. Sharing "beta" (tips for solving a route)
-- is a core part of gym culture. This migration supports:
--   FR-G2: Route feedback (text beta tips + optional video/image)
--   FR-G3: Abuse/spam reporting with moderation queue
--   FR-G5: Follow/friend system for activity feeds
--   FR-K1: Content ownership affirmation on media uploads
--
-- Design decisions:
-- ─────────────────
-- 1. route_feedback.score is denormalized (not maintained by a trigger).
--    The app/service layer updates it. A trigger could be added in Phase 9.
--
-- 2. content_reports.target_id is a polymorphic FK — it references different
--    tables based on target_type. No FK constraint because it's polymorphic;
--    referential integrity is enforced at the app layer. This is a common
--    pattern for reporting systems where you need to report different entity types.
--
-- 3. route_feedback_votes has no UPDATE policy — to change a vote direction,
--    delete and re-insert. This is simpler and prevents partial state issues.
--
-- 4. content_reports SELECT is restricted to own reports only. Admins access
--    the moderation queue via service_role (bypasses RLS) in Phase 15.
--
-- 5. All FKs use ON DELETE CASCADE — deleting a route/user cleans up all
--    associated social data automatically.
-- ===========================================================================


-- ===========================================================================
-- Table 1: route_feedback — Beta tips and comments on routes (FR-G2)
-- ===========================================================================
-- Each row is a text tip from a climber about how to approach a route.
-- The `score` column is a denormalized tally of up/down votes, maintained
-- by the app layer (not a trigger). It enables sorting tips by helpfulness.
CREATE TABLE public.route_feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id    uuid        NOT NULL REFERENCES public.routes (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  body        text        NOT NULL,            -- The beta tip text content
  score       integer     NOT NULL DEFAULT 0,  -- Denormalized vote tally (app-maintained)
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index on route_id because most queries filter by route:
-- "Show me all beta tips for route X, sorted by score"
CREATE INDEX idx_route_feedback_route_id ON public.route_feedback (route_id);


-- ===========================================================================
-- Table 2: route_feedback_votes — Up/down votes on beta tips
-- ===========================================================================
-- Composite PK (feedback_id, user_id) enforces one vote per user per tip.
-- Only 'up' and 'down' are valid vote directions.
--
-- Why no UPDATE policy? To change a vote, the user deletes their existing
-- vote and inserts a new one. This is simpler than tracking vote direction
-- changes and eliminates partial state issues.
CREATE TABLE public.route_feedback_votes (
  feedback_id uuid NOT NULL REFERENCES public.route_feedback (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  vote        text NOT NULL CHECK (vote IN ('up', 'down')),  -- Only two valid directions
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feedback_id, user_id)  -- One vote per user per feedback
);


-- ===========================================================================
-- Table 3: route_media — Videos and images attached to routes (FR-G2, FR-K1)
-- ===========================================================================
-- Stores references to media files in Supabase Storage.
-- The `type` column distinguishes between video beta and photos.
-- The `ownership_affirmed` boolean tracks whether the user confirmed they
-- own the content (FR-K1 compliance — required before publishing).
CREATE TABLE public.route_media (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id            uuid        NOT NULL REFERENCES public.routes (id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  url                 text        NOT NULL,  -- Supabase Storage public URL
  type                text        NOT NULL CHECK (type IN ('video', 'image')),
  ownership_affirmed  boolean     NOT NULL DEFAULT false,  -- FR-K1: user confirmed content ownership
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Index on route_id because route detail pages show all media for a route
CREATE INDEX idx_route_media_route_id ON public.route_media (route_id);


-- ===========================================================================
-- Table 4: content_reports — Abuse/spam reporting (FR-G3)
-- ===========================================================================
-- Users can report videos, feedback, or other users. Reports enter a
-- moderation queue (status = 'pending') and are reviewed by admins.
--
-- target_id is a polymorphic FK — it can reference route_media, route_feedback,
-- or profiles depending on target_type. No FK constraint on target_id because
-- different target_types reference different tables. App layer enforces this.
CREATE TABLE public.content_reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  target_type  text        NOT NULL CHECK (target_type IN ('video', 'feedback', 'user')),
  target_id    uuid        NOT NULL,  -- Polymorphic FK (references route_media, route_feedback, or profiles)
  reason       text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  reviewed_by  uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Index on status because the admin moderation queue filters by status:
-- "Show me all pending reports" is the primary admin query
CREATE INDEX idx_content_reports_status ON public.content_reports (status);


-- ===========================================================================
-- Table 5: follows — Follow relationships between climbers (FR-G5)
-- ===========================================================================
-- The follow system lets climbers subscribe to each other's activity.
-- Composite PK (follower_id, following_id) prevents duplicate follows.
-- CHECK constraint prevents self-follows (you can't follow yourself).
--
-- The relationship is directional: A follows B doesn't mean B follows A.
-- This is a "follow" model (like Twitter/Instagram), not a "friend" model
-- (like Facebook) which would require mutual acceptance.
CREATE TABLE public.follows (
  follower_id  uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  following_id uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)  -- Prevent self-follow
);

-- Index on following_id for "who follows me?" queries (follower counts).
-- The PK already creates an index on (follower_id, following_id), so queries
-- like "who do I follow?" are already covered.
CREATE INDEX idx_follows_following_id ON public.follows (following_id);


-- ===========================================================================
-- Enable Row Level Security on all 5 tables
-- ===========================================================================
-- RLS is Postgres's built-in authorization system. With RLS enabled but no
-- policies, only superusers can access the data ("secure by default").
-- We add permissive policies below to grant controlled access.
ALTER TABLE public.route_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_feedback_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- RLS Policies: route_feedback (4 policies)
-- ===========================================================================
-- All authenticated users can read beta tips (needed on route detail screens).
-- Users can create, edit, and delete only their own feedback.

-- SELECT: any authenticated user can read any feedback (public for route pages)
CREATE POLICY route_feedback_select_authenticated ON public.route_feedback
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: users can only create feedback attributed to themselves.
-- WITH CHECK prevents spoofing another user's identity in feedback posts.
CREATE POLICY route_feedback_insert_own ON public.route_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: users can only edit their own feedback (fix typos, update tips)
CREATE POLICY route_feedback_update_own ON public.route_feedback
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: users can remove their own feedback
CREATE POLICY route_feedback_delete_own ON public.route_feedback
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ===========================================================================
-- RLS Policies: route_feedback_votes (3 policies)
-- ===========================================================================
-- Votes are publicly readable (needed for vote count display).
-- Users can insert their own votes and delete them (to change vote direction).
-- No UPDATE policy — delete + re-insert is the pattern for changing votes.

-- SELECT: anyone can see votes (needed for "did I already vote?" checks)
CREATE POLICY feedback_votes_select_authenticated ON public.route_feedback_votes
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: users can only cast votes attributed to themselves
CREATE POLICY feedback_votes_insert_own ON public.route_feedback_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- DELETE: users can remove their own votes (to change vote direction)
CREATE POLICY feedback_votes_delete_own ON public.route_feedback_votes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ===========================================================================
-- RLS Policies: route_media (3 policies)
-- ===========================================================================
-- Media is publicly browsable. Users can upload and remove their own media.
-- No UPDATE policy — media metadata doesn't change after upload.

-- SELECT: all authenticated users can view media (route detail screens)
CREATE POLICY route_media_select_authenticated ON public.route_media
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: users can only upload media attributed to themselves
CREATE POLICY route_media_insert_own ON public.route_media
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- DELETE: users can remove their own media uploads
CREATE POLICY route_media_delete_own ON public.route_media
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ===========================================================================
-- RLS Policies: content_reports (2 policies)
-- ===========================================================================
-- Users can submit reports and see their own reports only.
-- Admin access to the full moderation queue is handled via service_role
-- (bypasses RLS) — that will be set up in Phase 15 (Admin Portal).

-- INSERT: any authenticated user can submit a report attributed to themselves
CREATE POLICY content_reports_insert_own ON public.content_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- SELECT: users can only see their own reports (not others' reports).
-- This prevents reporters from seeing who else reported the same content.
CREATE POLICY content_reports_select_own ON public.content_reports
  FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());


-- ===========================================================================
-- RLS Policies: follows (3 policies)
-- ===========================================================================
-- Follows are publicly readable (needed for follower counts and lists).
-- Users can follow/unfollow others but only as themselves.

-- SELECT: all authenticated users can see follow relationships.
-- Needed for follower/following counts, "is user A following user B?" checks,
-- and displaying follow lists on profile pages.
CREATE POLICY follows_select_authenticated ON public.follows
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: users can only follow others as themselves (follower_id = auth.uid()).
-- The CHECK constraint on the table already prevents self-follows.
CREATE POLICY follows_insert_own ON public.follows
  FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

-- DELETE: users can only unfollow (remove follows they initiated)
CREATE POLICY follows_delete_own ON public.follows
  FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());
