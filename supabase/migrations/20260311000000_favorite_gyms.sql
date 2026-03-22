-- ===========================================================================
-- Migration: Replace home_gym_id with favorite_gyms table
-- ===========================================================================
-- Previously, each user had a single "home gym" stored as a FK on profiles.
-- This migration replaces that with a many-to-many favorite_gyms table so
-- users can favorite multiple gyms.
--
-- Changes:
--   1. Create favorite_gyms join table with composite PK
--   2. Migrate existing home_gym_id data into favorite_gyms
--   3. Drop home_gym_id column from profiles (also drops FK + index)
--   4. Add RLS policies for favorite_gyms

-- ---------------------------------------------------------------------------
-- 1. Create favorite_gyms table
-- ---------------------------------------------------------------------------
-- Many-to-many relationship between users and gyms. A user can favorite
-- any number of gyms, and a gym can be favorited by any number of users.
-- Composite PK (user_id, gym_id) prevents duplicate favorites.
CREATE TABLE favorite_gyms (
  user_id    uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  gym_id     uuid        NOT NULL REFERENCES gyms (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gym_id)
);

ALTER TABLE favorite_gyms ENABLE ROW LEVEL SECURITY;

-- Index for looking up all favorites for a given user (the common query).
-- The composite PK already indexes (user_id, gym_id), but this standalone
-- index on user_id alone is more efficient for "get all favorites" queries
-- where we don't filter by gym_id.
CREATE INDEX idx_favorite_gyms_user_id ON favorite_gyms (user_id);

-- ---------------------------------------------------------------------------
-- 2. Migrate existing home_gym_id data
-- ---------------------------------------------------------------------------
-- Convert each user's home gym into their first favorite gym so no data is
-- lost during the migration. Only inserts rows where home_gym_id is not null.
INSERT INTO favorite_gyms (user_id, gym_id)
SELECT id, home_gym_id
FROM profiles
WHERE home_gym_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Drop home_gym_id from profiles
-- ---------------------------------------------------------------------------
-- This also drops the FK constraint (profiles_home_gym_id_fkey) and the
-- index (idx_profiles_home_gym_id) automatically.
ALTER TABLE profiles DROP COLUMN home_gym_id;

-- ---------------------------------------------------------------------------
-- 4. RLS policies for favorite_gyms
-- ---------------------------------------------------------------------------
-- Users can read their own favorites (for the favorites list / map filter).
CREATE POLICY favorite_gyms_select_own ON favorite_gyms
  FOR SELECT USING (auth.uid() = user_id);

-- Users can add gyms to their own favorites.
CREATE POLICY favorite_gyms_insert_own ON favorite_gyms
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can remove gyms from their own favorites.
CREATE POLICY favorite_gyms_delete_own ON favorite_gyms
  FOR DELETE USING (auth.uid() = user_id);
