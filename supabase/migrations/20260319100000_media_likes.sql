-- Migration: route_media_likes table + likes_count column
--
-- Adds a "heart" / like mechanism to beta videos. Follows the same
-- pattern as route_feedback_votes: a join table with composite PK
-- (media_id, user_id) so each user can like a video at most once.
--
-- A denormalized likes_count on route_media enables efficient sorting
-- ("most liked") without counting the join table on every read.

-- Add the denormalized counter to route_media so reads don't need
-- a COUNT query every time. Defaults to 0 for existing rows.
ALTER TABLE route_media ADD COLUMN likes_count integer NOT NULL DEFAULT 0;

-- Join table: one row per user-per-media like. Composite PK enforces
-- the one-like-per-user constraint at the database level.
CREATE TABLE route_media_likes (
  media_id   uuid NOT NULL REFERENCES route_media(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, user_id)
);

-- RLS must be enabled on every table — this is the hard security
-- boundary that prevents unauthorized access via PostgREST.
ALTER TABLE route_media_likes ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user can read likes (needed for "did I like
-- this?" checks and for displaying like counts).
CREATE POLICY media_likes_select ON route_media_likes
  FOR SELECT TO authenticated USING (true);

-- INSERT: users can only create likes as themselves (user_id must match
-- the authenticated user's ID). Prevents impersonation.
CREATE POLICY media_likes_insert ON route_media_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- DELETE: users can only remove their own likes. Combined with the
-- composite PK, this means a user can only unlike videos they liked.
CREATE POLICY media_likes_delete ON route_media_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Trigger: auto-maintain likes_count on route_media ─────────────
-- WHY a trigger instead of client-side count + update?
-- The route_media table has no UPDATE RLS policy (and shouldn't — users
-- shouldn't be able to modify other people's media rows). A trigger runs
-- with the table owner's privileges, bypassing RLS, so it can safely
-- update likes_count on any route_media row when a like is added or removed.
-- This also eliminates the race condition of count-then-update from the client.

CREATE OR REPLACE FUNCTION update_media_likes_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE route_media
      SET likes_count = (
        SELECT count(*) FROM route_media_likes WHERE media_id = NEW.media_id
      )
      WHERE id = NEW.media_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE route_media
      SET likes_count = (
        SELECT count(*) FROM route_media_likes WHERE media_id = OLD.media_id
      )
      WHERE id = OLD.media_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_media_likes_count
  AFTER INSERT OR DELETE ON route_media_likes
  FOR EACH ROW EXECUTE FUNCTION update_media_likes_count();
