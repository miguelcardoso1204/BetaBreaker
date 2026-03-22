-- =============================================================
-- Migration: sessions table + route_ascents.session_id FK
-- =============================================================
-- Persists climbing sessions so users can see their session
-- history on their profile. Previously sessions were ephemeral
-- Zustand state — start/end times, gym, and duration were lost
-- when the app closed.
--
-- WHY A SEPARATE TABLE (not just grouping ascents by date)?
-- A session has its own metadata (gym, start/end time, duration)
-- that doesn't belong on individual ascent rows. Grouping by
-- date was fragile — two sessions at different gyms on the same
-- day would merge into one. An explicit sessions table is the
-- source of truth.

-- 1. Create sessions table
CREATE TABLE sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  gym_id           uuid        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  duration_minutes integer     CHECK (duration_minutes >= 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS must be enabled on every table — it's the hard security
-- boundary. Without it, any authenticated user could read/write
-- any row via PostgREST.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Index on user_id: most queries filter by user (profile, history).
-- Index on gym_id: admin analytics queries filter by gym.
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_gym_id ON sessions(gym_id);

-- 2. RLS policies
-- SELECT: all authenticated users can read any session. Needed for
-- social features (seeing friends' activity) and leaderboard context.
CREATE POLICY sessions_select ON sessions
  FOR SELECT TO authenticated USING (true);

-- INSERT: users can only create sessions for themselves.
-- auth.uid() is the Supabase function that returns the JWT's sub claim.
CREATE POLICY sessions_insert ON sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- UPDATE: users can only update their own sessions (ending a session).
CREATE POLICY sessions_update ON sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- DELETE: users can only delete their own sessions.
CREATE POLICY sessions_delete ON sessions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 3. Add nullable session_id FK to route_ascents
-- WHY NULLABLE: existing ascent rows predate sessions and have no
-- session to link to. Ascents logged outside a formal session
-- (e.g., quick-log from route detail) also won't have one.
-- WHY ON DELETE SET NULL: if a session is deleted, keep the ascent
-- records — they're valuable data. The ascent just loses its link.
ALTER TABLE route_ascents
  ADD COLUMN session_id uuid REFERENCES sessions(id) ON DELETE SET NULL;

-- Index for "get all ascents in a session" queries.
CREATE INDEX idx_route_ascents_session_id ON route_ascents(session_id);
