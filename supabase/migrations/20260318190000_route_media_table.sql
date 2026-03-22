-- ==========================================================================
-- Migration: route_media table for beta video metadata
-- ==========================================================================
-- Stores metadata about uploaded beta videos (which route, who uploaded,
-- the Storage URL, and ownership confirmation). The actual video files
-- live in the beta-videos Storage bucket; this table links them to routes.

CREATE TABLE IF NOT EXISTS route_media (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id           uuid        NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url                text        NOT NULL,
  type               text        NOT NULL DEFAULT 'video',
  ownership_affirmed boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries: "all media for a route" and "all media by a user"
CREATE INDEX IF NOT EXISTS idx_route_media_route_id ON route_media(route_id);
CREATE INDEX IF NOT EXISTS idx_route_media_user_id ON route_media(user_id);

-- RLS policies (idempotent — drop first if they exist)
ALTER TABLE route_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS route_media_select ON route_media;
CREATE POLICY route_media_select ON route_media
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS route_media_insert ON route_media;
CREATE POLICY route_media_insert ON route_media
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS route_media_delete ON route_media;
CREATE POLICY route_media_delete ON route_media
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
