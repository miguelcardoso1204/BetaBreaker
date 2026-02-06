-- ===========================================================================
-- Migration: Competitions & Events Tables (Step 2.6)
-- ===========================================================================
-- Adds 4 tables for the competition/event system: event definitions,
-- event-route linking, competition categories, and athlete scores.
--
-- Why competitions?
-- ─────────────────
-- Indoor climbing gyms regularly host bouldering and lead competitions.
-- Athletes climb designated routes, earn scores, and compete within
-- categories (e.g., "Men Open", "Women U18"). This migration supports:
--   FR-H1: Event creation and management by gym admins
--   FR-H2: Score entry by athletes (own) and judges (any)
--   FR-H3: Category-based competition brackets
--   FR-H4: Event-route linking (which routes are in the competition)
--   FR-H5: Leaderboards/results computed from competition_scores
--
-- Design decisions:
-- ─────────────────
-- 1. scoring_model is a CHECK constraint (not an enum type) for easier
--    migration. Four models cover standard competition formats:
--    - tops_and_zones: IFSC-style counting tops and zones
--    - points: simple point accumulation per route
--    - thousand_divide_by: 1000/attempts scoring (USA Climbing)
--    - redpoint: best effort on each route counts
--
-- 2. events.created_by uses ON DELETE SET NULL — if the creator's profile
--    is deleted, the event is preserved (other admins can still manage it).
--    But gym_id uses ON DELETE CASCADE — if the gym is deleted, all its
--    events are removed (no orphaned events).
--
-- 3. competition_scores INSERT policy allows athletes to enter their own
--    score (user_id = auth.uid()) OR judges to enter any score. This
--    dual-path INSERT is needed because some comps have self-reporting
--    while others have judge-verified scoring.
--
-- 4. competition_scores UPDATE is judge-only. Once entered, only judges
--    can correct scores. Athletes cannot edit scores after submission.
--
-- 5. competition_scores DELETE is gym_admin-only. Score deletion is a
--    significant action that should only be done by admins (e.g., DQ).
-- ===========================================================================


-- ===========================================================================
-- Table 1: events — Competition/event definitions (FR-H1)
-- ===========================================================================
-- Each event belongs to a gym and has a scoring model that determines how
-- athlete performance is evaluated. The status column tracks the event
-- lifecycle: draft → registration_open → ongoing → completed/cancelled.
CREATE TABLE public.events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id         uuid        NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  name           text        NOT NULL,
  -- The scoring model determines how scores are calculated and compared.
  -- Different competition formats use different models:
  --   tops_and_zones: IFSC-style (count tops, then zones, then attempts)
  --   points: simple accumulation (each route has a point value)
  --   thousand_divide_by: 1000 / number of attempts (USA Climbing)
  --   redpoint: best single effort on each route
  scoring_model  text        NOT NULL
    CHECK (scoring_model IN ('tops_and_zones', 'points', 'thousand_divide_by', 'redpoint')),
  start_date     timestamptz NOT NULL,
  end_date       timestamptz NOT NULL,
  -- The event lifecycle: admins move events through these states.
  -- 'draft' is the initial state — event is being set up, not yet visible
  -- to athletes. 'registration_open' allows athletes to sign up.
  -- 'ongoing' means the competition is in progress. 'completed' and
  -- 'cancelled' are terminal states.
  status         text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'registration_open', 'ongoing', 'completed', 'cancelled')),
  -- ON DELETE SET NULL: if the creator's profile is deleted, keep the event.
  -- Other gym admins can still manage it. The column is nullable so that
  -- SET NULL can work when the creator's profile is cascade-deleted.
  -- A creator is expected at INSERT time but not enforced with NOT NULL,
  -- because NOT NULL would conflict with ON DELETE SET NULL.
  created_by     uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- end_date must be after start_date to prevent nonsensical date ranges
  CHECK (end_date > start_date)
);

-- Index on gym_id — most queries filter events by gym:
-- "Show me all events at this gym"
CREATE INDEX idx_events_gym_id ON public.events (gym_id);

-- Index on status — filter by event state:
-- "Show me all ongoing competitions" or "Show me upcoming events"
CREATE INDEX idx_events_status ON public.events (status);


-- ===========================================================================
-- Table 2: event_routes — Junction table linking events to routes (FR-H4)
-- ===========================================================================
-- Each competition uses a subset of the gym's routes. This junction table
-- tracks which routes are included in which events. The composite PK
-- prevents adding the same route to an event twice. sort_order controls
-- the display order of routes in the competition (e.g., easiest first).
CREATE TABLE public.event_routes (
  event_id   uuid    NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  route_id   uuid    NOT NULL REFERENCES public.routes (id) ON DELETE CASCADE,
  -- sort_order controls display ordering in the competition UI.
  -- Routes are typically ordered by difficulty (easiest first).
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, route_id)
);


-- ===========================================================================
-- Table 3: event_categories — Competition brackets (FR-H3)
-- ===========================================================================
-- Categories divide athletes into groups for fair competition.
-- Examples: "Men Open", "Women U18", "Youth A", "Masters 40+".
-- Each category is unique per event (you can't have two "Men Open"
-- categories in the same competition).
CREATE TABLE public.event_categories (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  name     text NOT NULL,
  -- Prevent duplicate category names within the same event.
  -- Same name is fine across different events (e.g., every comp has "Men Open").
  UNIQUE (event_id, name)
);


-- ===========================================================================
-- Table 4: competition_scores — Athlete scores per route (FR-H2, FR-H5)
-- ===========================================================================
-- Records one score per athlete per route per event. Scores can be
-- entered by the athlete (self-reporting) or by a judge (verified entry).
-- The category_id links the score to a competition bracket (optional
-- because some events don't use categories).
CREATE TABLE public.competition_scores (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  route_id    uuid        NOT NULL REFERENCES public.routes (id) ON DELETE CASCADE,
  -- Optional category — some competitions don't have categories.
  -- ON DELETE SET NULL: if a category is deleted, the score remains
  -- but loses its category assignment.
  category_id uuid        REFERENCES public.event_categories (id) ON DELETE SET NULL,
  score       integer     NOT NULL DEFAULT 0,
  -- Optional judge who verified this score. NULL means self-reported.
  -- ON DELETE SET NULL: if the judge's profile is deleted, the verification
  -- record is cleared but the score itself remains.
  verified_by uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- One score per athlete per route per event — prevents duplicate entries.
  -- To update a score, use UPDATE (not INSERT a second row).
  UNIQUE (event_id, user_id, route_id)
);

-- Index on event_id — leaderboard queries aggregate scores per event:
-- "Show me all scores for this competition, ordered by total"
CREATE INDEX idx_competition_scores_event_id ON public.competition_scores (event_id);

-- Index on user_id — athlete history queries:
-- "Show me all competition scores for this athlete"
CREATE INDEX idx_competition_scores_user_id ON public.competition_scores (user_id);


-- ===========================================================================
-- Enable Row Level Security on all 4 tables
-- ===========================================================================
-- With RLS enabled but no policies, only superusers can access the data.
-- We add permissive policies below to grant controlled access based on
-- user roles (gym_admin, judge, authenticated).
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_scores ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- RLS Policies: events (4 policies)
-- ===========================================================================
-- All authenticated users can browse events (for discovery and leaderboards).
-- Only gym_admin+ can create, edit, and delete events at their gym.

-- SELECT: any authenticated user can see any event
CREATE POLICY events_select_authenticated ON public.events
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: only gym admins (or higher) can create events at their gym.
-- The role check uses the gym_id column from the row being inserted.
CREATE POLICY events_insert_gym_admin ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- UPDATE: only gym admins can modify events (change status, dates, name, etc.)
CREATE POLICY events_update_gym_admin ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );

-- DELETE: only gym admins can remove events entirely
CREATE POLICY events_delete_gym_admin ON public.events
  FOR DELETE
  TO authenticated
  USING (
    public.role_rank(public.get_user_role(gym_id)) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- RLS Policies: event_routes (3 policies)
-- ===========================================================================
-- Event routes are publicly readable (athletes need to see which routes
-- are in the competition). Only gym admins can link/unlink routes.
-- No UPDATE policy needed — to change sort_order, delete and re-insert.

-- SELECT: any authenticated user can see event-route associations
CREATE POLICY event_routes_select_authenticated ON public.event_routes
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: gym admins can link routes to events.
-- Uses a subquery to get the gym_id from the events table, since
-- event_routes doesn't have a direct gym_id column.
CREATE POLICY event_routes_insert_gym_admin ON public.event_routes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.events WHERE id = event_id)
      )
    ) >= public.role_rank('gym_admin')
  );

-- DELETE: gym admins can unlink routes from events
CREATE POLICY event_routes_delete_gym_admin ON public.event_routes
  FOR DELETE
  TO authenticated
  USING (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.events WHERE id = event_id)
      )
    ) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- RLS Policies: event_categories (4 policies)
-- ===========================================================================
-- Categories are publicly readable (athletes see which categories exist).
-- Only gym admins can create, edit, and delete categories.

-- SELECT: any authenticated user can see categories
CREATE POLICY event_categories_select_authenticated ON public.event_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: gym admins can create categories for their events
CREATE POLICY event_categories_insert_gym_admin ON public.event_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.events WHERE id = event_id)
      )
    ) >= public.role_rank('gym_admin')
  );

-- UPDATE: gym admins can rename categories
CREATE POLICY event_categories_update_gym_admin ON public.event_categories
  FOR UPDATE
  TO authenticated
  USING (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.events WHERE id = event_id)
      )
    ) >= public.role_rank('gym_admin')
  );

-- DELETE: gym admins can remove categories
CREATE POLICY event_categories_delete_gym_admin ON public.event_categories
  FOR DELETE
  TO authenticated
  USING (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.events WHERE id = event_id)
      )
    ) >= public.role_rank('gym_admin')
  );


-- ===========================================================================
-- RLS Policies: competition_scores (4 policies)
-- ===========================================================================
-- Scores are publicly readable (leaderboards and results pages).
-- INSERT: athletes can enter their own scores OR judges can enter any score.
-- UPDATE: only judges can modify scores (for verification/correction).
-- DELETE: only gym admins can remove scores (e.g., disqualification).

-- SELECT: any authenticated user can view scores (needed for leaderboards)
CREATE POLICY comp_scores_select_authenticated ON public.competition_scores
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: athletes insert own scores (user_id = auth.uid()), OR judges
-- can insert scores for any athlete. This dual-path policy uses OR:
-- Path 1: Self-reporting (user_id matches the authenticated user)
-- Path 2: Judge entry (user has judge+ role at the event's gym)
CREATE POLICY comp_scores_insert_own_or_judge ON public.competition_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.events WHERE id = event_id)
      )
    ) >= public.role_rank('judge')
  );

-- UPDATE: only judges (or higher) can modify scores after submission.
-- Athletes cannot edit their own scores — this prevents score manipulation.
-- If an athlete made an error, they ask a judge to correct it.
CREATE POLICY comp_scores_update_judge ON public.competition_scores
  FOR UPDATE
  TO authenticated
  USING (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.events WHERE id = event_id)
      )
    ) >= public.role_rank('judge')
  );

-- DELETE: only gym admins can remove scores (e.g., athlete disqualification).
-- This is a significant action — judges can modify but only admins can delete.
CREATE POLICY comp_scores_delete_gym_admin ON public.competition_scores
  FOR DELETE
  TO authenticated
  USING (
    public.role_rank(
      public.get_user_role(
        (SELECT gym_id FROM public.events WHERE id = event_id)
      )
    ) >= public.role_rank('gym_admin')
  );
