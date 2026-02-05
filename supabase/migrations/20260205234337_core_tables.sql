-- ===========================================================================
-- Migration: Core Tables (Step 2.1)
-- ===========================================================================
-- Creates the 7 foundational tables for Beta Breaker:
--   1. gyms         — climbing gyms with location and settings
--   2. profiles     — user profiles linked to Supabase Auth
--   3. routes       — climbing routes set at gyms
--   4. style_tags   — reusable tags like "crimpy", "slab", "overhang"
--   5. route_style_tags — many-to-many join between routes and style_tags
--   6. route_ascents — individual climb logs (the core "tick" data)
--   7. user_gym_roles — role-based access: climber, setter, judge, gym_admin, super_admin
--
-- Design decisions:
-- - CHECK constraints instead of CREATE TYPE for enums.
--   Postgres custom enum types require ALTER TYPE ... ADD VALUE to change,
--   which can't run inside a transaction. CHECK constraints are simpler
--   to migrate and achieve the same validation.
-- - gen_random_uuid() for primary keys — built-in to Postgres 13+,
--   no extension needed. UUIDs prevent enumeration attacks and work well
--   with distributed systems.
-- - RLS (Row Level Security) is ENABLED on all tables but NO POLICIES
--   are added yet. With RLS on and no policies, only the postgres
--   superuser can access data — this is "secure by default". Policies
--   will be added in Step 2.2.
-- - ON DELETE CASCADE on child tables means deleting a parent row
--   automatically deletes all related children. This prevents orphaned
--   rows (e.g., deleting a route also deletes its ascents).
-- - ON DELETE SET NULL for optional references (e.g., setter_id on routes).
--   If a setter's profile is deleted, the route still exists but loses
--   its setter attribution.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. gyms — Climbing gyms
-- ---------------------------------------------------------------------------
-- This is a top-level entity with no foreign key dependencies.
-- Other tables (routes, profiles, user_gym_roles) reference gyms.
CREATE TABLE gyms (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  address             text,
  latitude            double precision,
  longitude           double precision,
  -- JSONB stores flexible key-value data (e.g., { "instagram": "...", "website": "..." })
  -- JSONB is preferred over JSON because it's stored in a decomposed binary format,
  -- which is faster to query and supports indexing
  social_links        jsonb       DEFAULT '{}',
  -- CHECK constraint validates that only known grade systems are accepted.
  -- The app converts between these in utils/grades.ts
  default_grade_system text       NOT NULL DEFAULT 'v-scale'
    CHECK (default_grade_system IN ('v-scale', 'font', 'yds')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS — no policies yet (secure by default, Step 2.2 adds policies)
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 2. profiles — User profiles (linked to Supabase Auth)
-- ---------------------------------------------------------------------------
-- Each profile is 1:1 with an auth.users row. The FK uses ON DELETE CASCADE
-- so if a user is deleted from Supabase Auth, their profile is also removed.
-- This table extends the auth.users data with app-specific fields.
CREATE TABLE profiles (
  -- id matches auth.users.id — this is the user's UUID from Supabase Auth
  id                    uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name          text,
  avatar_url            text,
  -- Optional "home gym" — if the gym is deleted, we SET NULL rather than
  -- deleting the profile (the user still exists, just without a home gym)
  home_gym_id           uuid        REFERENCES gyms (id) ON DELETE SET NULL,
  preferred_grade_system text       NOT NULL DEFAULT 'v-scale'
    CHECK (preferred_grade_system IN ('v-scale', 'font', 'yds')),
  -- Subscription tier: 'free' or 'pro'. Checked by Edge Functions for
  -- feature gating (e.g., advanced analytics, video storage limits)
  tier                  text        NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'pro')),
  -- Tracks whether the user has completed the onboarding wizard
  onboarding_completed  boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 3. routes — Climbing routes at gyms
-- ---------------------------------------------------------------------------
-- A route belongs to a gym and optionally has a setter (profile).
-- canonical_grade is an integer 0–30 that maps to V-scale, Font, or YDS
-- grades via the conversion table in utils/grades.ts.
CREATE TABLE routes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which gym this route is at — CASCADE means deleting a gym deletes all its routes
  gym_id          uuid        NOT NULL REFERENCES gyms (id) ON DELETE CASCADE,
  name            text,
  -- Grade stored as integer 0–30. The app's grade conversion system
  -- (utils/grades.ts) maps this to human-readable grades like V5 or 6c+
  canonical_grade integer     NOT NULL CHECK (canonical_grade >= 0 AND canonical_grade <= 30),
  color           text,
  wall_section    text,
  -- The setter who created this route — SET NULL if setter profile is deleted
  setter_id       uuid        REFERENCES profiles (id) ON DELETE SET NULL,
  -- Route lifecycle: active → retiring_soon → archived
  -- CHECK constraint ensures only these 3 values are accepted
  status          text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'retiring_soon', 'archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- When the route was taken down — NULL while still up
  retired_at      timestamptz
);

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

-- Index on gym_id: most queries filter routes by gym ("show me routes at my gym")
CREATE INDEX idx_routes_gym_id ON routes (gym_id);
-- Index on status: filtering active vs archived routes is very common
CREATE INDEX idx_routes_status ON routes (status);


-- ---------------------------------------------------------------------------
-- 4. style_tags — Reusable tags for route characteristics
-- ---------------------------------------------------------------------------
-- Tags like "crimpy", "slab", "overhang", "dynamic" describe route style.
-- Climbers can vote on tags (vote_count in route_style_tags) to crowd-source
-- route descriptions — a gym's "beta" knowledge base.
CREATE TABLE style_tags (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE ensures no duplicate tag names (e.g., can't have two "slab" tags)
  name     text NOT NULL UNIQUE,
  -- Optional grouping: "hold_type", "movement", "angle", etc.
  category text
);

ALTER TABLE style_tags ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 5. route_style_tags — Many-to-many join between routes and style_tags
-- ---------------------------------------------------------------------------
-- A route can have many tags, and a tag can apply to many routes.
-- This is the standard "junction table" pattern for many-to-many relationships.
-- The composite PK (route_id, tag_id) prevents duplicate tag assignments.
CREATE TABLE route_style_tags (
  route_id   uuid    NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
  tag_id     uuid    NOT NULL REFERENCES style_tags (id) ON DELETE CASCADE,
  -- Denormalized vote count — how many climbers agree this tag fits the route.
  -- Denormalized means we store the count directly instead of counting rows
  -- in a separate votes table. Simpler and faster for reads, updated via
  -- triggers or app logic.
  vote_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (route_id, tag_id)
);

ALTER TABLE route_style_tags ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 6. route_ascents — Individual climb logs ("ticks")
-- ---------------------------------------------------------------------------
-- This is the core data table — every time a climber logs a route attempt,
-- a row is created here. It's the basis for streaks, leaderboards, and
-- progression tracking.
CREATE TABLE route_ascents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who climbed it — CASCADE means deleting a profile deletes their ascents
  user_id         uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  -- Which route — CASCADE means deleting a route deletes its ascent records
  route_id        uuid        NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
  -- flash = first try, send = completed after multiple tries, attempt = did not complete
  status          text        NOT NULL
    CHECK (status IN ('flash', 'send', 'attempt')),
  -- Number of attempts on this route in this session — minimum 1
  attempts        integer     NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  -- Free-text notes the climber can add ("heel hook on the crux worked")
  notes           text,
  -- What the climber thinks the grade should be (community consensus feature)
  -- Uses the same 0–30 scale as canonical_grade
  perceived_grade integer     CHECK (perceived_grade >= 0 AND perceived_grade <= 30),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE route_ascents ENABLE ROW LEVEL SECURITY;

-- Index on user_id: "show me all my ascents" is the most common query
CREATE INDEX idx_route_ascents_user_id ON route_ascents (user_id);
-- Index on route_id: "show me who has climbed this route" for social features
CREATE INDEX idx_route_ascents_route_id ON route_ascents (route_id);


-- ---------------------------------------------------------------------------
-- 7. user_gym_roles — Role-based access per gym
-- ---------------------------------------------------------------------------
-- Maps users to roles at specific gyms. Composite PK (user_id, gym_id) means
-- one role per user per gym. The role hierarchy is:
--   climber < setter < judge < gym_admin < super_admin
-- RLS policies (Step 2.2) use this table to determine what actions a user
-- can perform at a given gym.
CREATE TABLE user_gym_roles (
  user_id    uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  gym_id     uuid NOT NULL REFERENCES gyms (id) ON DELETE CASCADE,
  -- CHECK constraint restricts to the 5 known roles
  role       text NOT NULL
    CHECK (role IN ('climber', 'setter', 'judge', 'gym_admin', 'super_admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gym_id)
);

ALTER TABLE user_gym_roles ENABLE ROW LEVEL SECURITY;

-- Index on gym_id: "show me all users at this gym" for admin views
CREATE INDEX idx_user_gym_roles_gym_id ON user_gym_roles (gym_id);
