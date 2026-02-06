-- ===========================================================================
-- Migration: Notifications & Saved Routes Tables (Step 2.7)
-- ===========================================================================
-- Adds 4 tables for in-app notifications (FR-J1–J3) and route bookmarking
-- (FR-C4). This step is tables + RLS only — triggers that *create*
-- notifications and Edge Functions for push delivery come in Phase 10.
--
-- Why notifications?
-- ──────────────────
-- Users need to know when a friend sends a request, a route they follow
-- is retired, their competition ranking changes, or they earn a badge.
-- The `notifications` table is an append-only log written by the system
-- (via SECURITY DEFINER triggers or service_role Edge Functions).
-- Authenticated users can only SELECT and UPDATE (mark as read) — they
-- cannot INSERT or DELETE their own notifications.
--
-- Why saved_routes?
-- ─────────────────
-- Climbers "project" hard routes (saving them to attempt later), keep
-- wishlists of routes at other gyms, and mark favorites for quick access.
-- The save_type column distinguishes these three use-cases.
--
-- Design decisions:
-- ─────────────────
-- 1. notifications has no INSERT or DELETE policy for authenticated users.
--    Only the system can create notifications (SECURITY DEFINER / service_role),
--    and notifications are a permanent history log.
--
-- 2. push_tokens stores Expo push tokens for each device. The UNIQUE
--    constraint on (user_id, token) prevents duplicate registrations.
--    Users can DELETE their own tokens (logout/device removal) but
--    cannot UPDATE — re-register instead.
--
-- 3. notification_preferences uses an opt-out model: no row means enabled.
--    The app layer checks for a row with enabled = false before sending.
--    This keeps the table sparse (only users who change defaults create rows).
--
-- 4. saved_routes allows the same route under multiple save_types
--    (a route can be both a "project" and a "favorite"), but the
--    UNIQUE(user_id, route_id, save_type) prevents duplicate bookmarks
--    within the same type.
--
-- 5. All FKs use ON DELETE CASCADE — deleting a user cleans up all
--    their notifications, tokens, preferences, and saved routes.
--    Deleting a route cleans up saved_routes referencing it.
-- ===========================================================================


-- ===========================================================================
-- Table 1: notifications — In-app notification history (FR-J1, FR-J2)
-- ===========================================================================
-- Each row is a notification delivered to a user. The `type` column
-- categorizes the notification for filtering and display. The `data`
-- JSONB column holds a flexible payload for deep linking (e.g., the
-- route ID to navigate to when the user taps a "route retired" notification).
--
-- The `read` boolean lets the app show unread counts and mark-as-read.
-- Notifications are system-generated — users cannot create or delete them.
CREATE TABLE public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  type       text        NOT NULL CHECK (type IN (
    'friend_send',        -- Someone sent a follow/friend request
    'route_retirement',   -- A route the user saved/climbed is being retired
    'comp_update',        -- Competition status change (opened, results posted)
    'rank_change',        -- User moved up/down on a leaderboard
    'badge_earned',       -- User earned a new achievement badge
    'general'             -- Catch-all for system announcements
  )),
  title      text        NOT NULL,   -- Short display title (e.g., "New Badge!")
  body       text        NOT NULL,   -- Longer description shown in notification list
  data       jsonb       NOT NULL DEFAULT '{}',  -- Deep-link payload (e.g., {"route_id": "..."})
  read       boolean     NOT NULL DEFAULT false,  -- Whether the user has seen this notification
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index on user_id: "Show me all my notifications" (the primary query)
CREATE INDEX idx_notifications_user_id ON public.notifications (user_id);

-- Composite index on (user_id, read): "How many unread notifications do I have?"
-- This powers the badge count on the notification bell icon.
CREATE INDEX idx_notifications_user_id_read ON public.notifications (user_id, read);


-- ===========================================================================
-- Table 2: push_tokens — Device push notification tokens
-- ===========================================================================
-- Stores Expo push tokens for each user's device(s). A user can have
-- multiple tokens (e.g., phone + tablet). The Edge Function in Phase 10
-- queries this table to know which devices to send push notifications to.
--
-- UNIQUE(user_id, token) prevents the same device token from being
-- registered twice for the same user (e.g., if the app re-registers on launch).
CREATE TABLE public.push_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  token      text        NOT NULL,      -- Expo push token (e.g., "ExponentPushToken[xxx]")
  platform   text        NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)  -- Same token can't be registered twice per user
);

-- Index on user_id: "Get all push tokens for this user" (used by push dispatcher)
CREATE INDEX idx_push_tokens_user_id ON public.push_tokens (user_id);


-- ===========================================================================
-- Table 3: notification_preferences — Per-category opt-out settings (FR-J3)
-- ===========================================================================
-- Users can disable specific notification categories. The opt-out model
-- means no row = enabled. The app layer checks:
--   SELECT enabled FROM notification_preferences
--   WHERE user_id = $1 AND category = $2
-- If no row is returned, the category is enabled (default behavior).
--
-- UNIQUE(user_id, category) ensures one preference row per category per user.
-- This avoids conflicting settings (e.g., two rows for "friends", one true
-- and one false).
CREATE TABLE public.notification_preferences (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  category   text        NOT NULL CHECK (category IN (
    'friends',        -- Follow/friend request notifications
    'routes',         -- Route retirement, new routes at saved gyms
    'comps',          -- Competition updates (registration, results)
    'achievements'    -- Badge earned, streak milestones
  )),
  enabled    boolean     NOT NULL DEFAULT true,   -- true = on, false = muted
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)  -- One preference per category per user
);


-- ===========================================================================
-- Table 4: saved_routes — Route bookmarking/wishlisting (FR-C4)
-- ===========================================================================
-- Climbers can save routes under three categories:
--   - "project": a hard route they're actively working on
--   - "wishlist": a route they want to try (maybe at another gym)
--   - "favorite": a route they loved and want to revisit
--
-- The same route can appear under multiple save_types (e.g., a route can
-- be both a project and a favorite), but UNIQUE(user_id, route_id, save_type)
-- prevents duplicate bookmarks within the same type.
CREATE TABLE public.saved_routes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  route_id   uuid        NOT NULL REFERENCES public.routes (id) ON DELETE CASCADE,
  save_type  text        NOT NULL CHECK (save_type IN ('project', 'wishlist', 'favorite')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, route_id, save_type)  -- No duplicate bookmarks within same type
);

-- Index on user_id: "Show me all my saved routes" (the primary query)
CREATE INDEX idx_saved_routes_user_id ON public.saved_routes (user_id);


-- ===========================================================================
-- Enable Row Level Security on all 4 tables
-- ===========================================================================
-- With RLS enabled but no policies, only superusers can access the data.
-- This is "secure by default" — we add permissive policies below to grant
-- controlled access to authenticated users.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- RLS Policies: notifications (3 policies — no INSERT/DELETE for authenticated)
-- ===========================================================================
-- Notifications are system-generated. Users can only read their own
-- notifications and mark them as read. They cannot create or delete
-- notifications — that's done by SECURITY DEFINER triggers (Phase 10)
-- or service_role Edge Functions (which bypass RLS entirely).

-- SELECT: users can only see their own notifications
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- UPDATE: users can mark their own notifications as read.
-- The WITH CHECK ensures they can't reassign notifications to another user.
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No INSERT policy: only system (SECURITY DEFINER / service_role) can create
-- No DELETE policy: notifications are a permanent history log


-- ===========================================================================
-- RLS Policies: push_tokens (3 policies — SELECT, INSERT, DELETE)
-- ===========================================================================
-- Users manage their own device tokens. They register tokens on app launch
-- (INSERT), can view their tokens (SELECT), and remove them on logout (DELETE).
-- No UPDATE — if a token changes, delete the old one and insert a new one.

-- SELECT: users can see their own push tokens
CREATE POLICY push_tokens_select_own ON public.push_tokens
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT: users can register their own push tokens
CREATE POLICY push_tokens_insert_own ON public.push_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- DELETE: users can remove their own push tokens (logout/device removal)
CREATE POLICY push_tokens_delete_own ON public.push_tokens
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ===========================================================================
-- RLS Policies: notification_preferences (4 policies — full CRUD on own)
-- ===========================================================================
-- Users have full control over their notification preferences.
-- They can create, read, update, and delete their own preference rows.

-- SELECT: users can see their own preferences
CREATE POLICY notification_prefs_select_own ON public.notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT: users can create their own preferences
CREATE POLICY notification_prefs_insert_own ON public.notification_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: users can toggle their own preferences (enable/disable)
CREATE POLICY notification_prefs_update_own ON public.notification_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: users can remove their own preferences (revert to defaults)
CREATE POLICY notification_prefs_delete_own ON public.notification_preferences
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ===========================================================================
-- RLS Policies: saved_routes (4 policies — full CRUD on own)
-- ===========================================================================
-- Users have full control over their route bookmarks.
-- They can save, view, update, and remove their own saved routes.

-- SELECT: users can see their own saved routes
CREATE POLICY saved_routes_select_own ON public.saved_routes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT: users can save routes for themselves
CREATE POLICY saved_routes_insert_own ON public.saved_routes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: users can change save_type on their own saved routes
-- (e.g., upgrade a "wishlist" item to a "project")
CREATE POLICY saved_routes_update_own ON public.saved_routes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: users can unsave their own routes
CREATE POLICY saved_routes_delete_own ON public.saved_routes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
