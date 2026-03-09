-- ===========================================================================
-- Seed Data for Local Development (Step 2.9)
-- ===========================================================================
-- This file runs automatically during `supabase db reset` AFTER all
-- migrations have been applied. It populates the database with realistic
-- development data so you can immediately interact with the app.
--
-- Design decisions:
-- ─────────────────
-- 1. Fixed UUIDs: All entities use deterministic UUIDs (e.g., 10000000-...-001
--    for the gym, 20000000-...-001 for the climber). This makes the data
--    referenceable in tests and predictable during development.
--
-- 2. Trigger-driven gamification: We INSERT ascents and let the existing
--    triggers (on_ascent_insert) automatically populate user_badges,
--    user_streaks, and leaderboard_entries. This validates that the trigger
--    chain works end-to-end with real data.
--
-- 3. Relative timestamps: Ascents use `now() - interval 'X weeks'` so
--    streak data is always "current" regardless of when db reset runs.
--
-- 4. ON CONFLICT DO NOTHING: All inserts are idempotent. Although
--    `supabase db reset` always starts fresh, this prevents errors if
--    the seed is ever run manually on an existing database.
--
-- What is NOT seeded here (auto-populated):
-- ──────────────────────────────────────────
-- - badges table:         Already seeded by migration 20260206003749_seed_badges.sql
-- - user_badges:          Auto-populated by check_and_award_badges() trigger
-- - user_streaks:         Auto-populated by recompute_streak() trigger
-- - leaderboard_entries:  Auto-populated by compute_leaderboard() trigger
-- ===========================================================================


-- pgcrypto is needed for crypt()/gen_salt() when creating auth.users rows.
-- On cloud Supabase, pgcrypto lives in the `extensions` schema.
-- We use extensions.crypt()/extensions.gen_salt() below for portability.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- ===========================================================================
-- Section 1: Gym
-- ===========================================================================
-- One gym with realistic metadata. The fixed UUID lets tests and other
-- seed sections reference it directly without querying.
INSERT INTO public.gyms (id, name, address, latitude, longitude, social_links, default_grade_system, operating_hours)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Vertigo Climbing Center',
  'Av. Infante D. Henrique 334, Armazém 6, 1800-224 Lisboa',
  38.7340,   -- Marvila, Lisbon
  -9.1050,
  '{"instagram": "@vertigoclimbing", "website": "https://vertigoclimbing.pt"}'::jsonb,
  'font',
  '{"monday":{"open":"07:00","close":"23:00"},"wednesday":{"open":"07:00","close":"23:00"},"friday":{"open":"07:00","close":"23:00"},"tuesday":{"open":"10:00","close":"23:00"},"thursday":{"open":"10:00","close":"23:00"},"saturday":{"open":"10:00","close":"20:00"},"sunday":{"open":"10:00","close":"18:00"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;


-- ===========================================================================
-- Section 2: Auth Users (3 users)
-- ===========================================================================
-- Inserting into auth.users fires the handle_new_user() trigger, which
-- automatically creates a profile row with display_name from raw_user_meta_data.
-- After the trigger fires, we UPDATE profiles to set home_gym_id and
-- onboarding_completed (the trigger only sets id + display_name).
--
-- The instance_id, aud, role, and token fields are required by auth.users
-- but aren't meaningful for local dev — they're set to Supabase defaults.

-- User 1: Alex Climber (regular climber)
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'climber@seed.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"display_name": "Alex Climber"}'::jsonb,
  '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

-- User 2: Sam Setter (route setter)
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'setter@seed.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"display_name": "Sam Setter"}'::jsonb,
  '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

-- User 3: Jordan Admin (gym admin)
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-0000-0000-000000000003',
  'authenticated', 'authenticated', 'admin@seed.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"display_name": "Jordan Admin"}'::jsonb,
  '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

-- Now update the auto-created profiles with home gym and onboarding status.
-- The handle_new_user trigger already created these rows with display_name;
-- we just add the fields the trigger doesn't set.
UPDATE public.profiles
SET home_gym_id = '10000000-0000-0000-0000-000000000001',
    onboarding_completed = true
WHERE id IN (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003'
);


-- ===========================================================================
-- Section 3: Gym Roles
-- ===========================================================================
-- Each user gets a role at the gym. These roles are checked by RLS policies
-- via get_user_role() to determine what actions each user can perform.
INSERT INTO public.user_gym_roles (user_id, gym_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'climber'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'setter'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'gym_admin')
ON CONFLICT (user_id, gym_id) DO NOTHING;


-- ===========================================================================
-- Section 4: Style Tags (8 tags)
-- ===========================================================================
-- Tags describe route characteristics. Categories group them for filtering:
--   'angle'     — wall angle (slab, overhang)
--   'hold_type' — predominant hold style (crimpy, slopey, juggy)
--   'movement'  — movement pattern (dyno, techy, comp-style)
INSERT INTO public.style_tags (id, name, category) VALUES
  ('40000000-0000-0000-0000-000000000001', 'slab',       'angle'),
  ('40000000-0000-0000-0000-000000000002', 'overhang',   'angle'),
  ('40000000-0000-0000-0000-000000000003', 'crimpy',     'hold_type'),
  ('40000000-0000-0000-0000-000000000004', 'slopey',     'hold_type'),
  ('40000000-0000-0000-0000-000000000005', 'dyno',       'movement'),
  ('40000000-0000-0000-0000-000000000006', 'juggy',      'hold_type'),
  ('40000000-0000-0000-0000-000000000007', 'techy',      'movement'),
  ('40000000-0000-0000-0000-000000000008', 'comp-style', 'movement')
ON CONFLICT (name) DO NOTHING;


-- ===========================================================================
-- Section 5: Routes (18 routes spanning V0–V10)
-- ===========================================================================
-- Routes are assigned to Summit Climbing Gym with Sam Setter as the creator.
-- Canonical grades cover all badge thresholds: 0, 2, 5, 8, 10, 13, 15, 18, 20, 23, 25.
-- Mix of statuses: 15 active, 2 retiring_soon, 1 archived.
-- Mix of colors and wall sections for realistic variety.
--
-- Grade → V-scale reference (from utils/grades.ts):
--   0=V0, 2=V1, 5=V2, 8=V3, 10=V4, 13=V5, 15=V6, 18=V7, 20=V8, 23=V9, 25=V10
INSERT INTO public.routes (id, gym_id, name, canonical_grade, color, wall_section, setter_id, status) VALUES
  -- V0–V2: Beginner routes
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Baby Steps',        0,  'green',  'slab-wall',      '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'First Timer',       2,  'yellow', 'vert-wall',      '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Easy Street',       5,  'blue',   'slab-wall',      '20000000-0000-0000-0000-000000000002', 'active'),

  -- V3–V4: Intermediate routes
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Crimpy Corner',     8,  'red',    'vert-wall',      '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Balance Act',       8,  'orange', 'slab-wall',      '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Pocket Rocket',    10,  'purple', 'vert-wall',      '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'Dyno Drama',       10,  'yellow', 'overhang-cave',  '20000000-0000-0000-0000-000000000002', 'active'),

  -- V5–V6: Advanced routes
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'Power Play',       13,  'red',    'overhang-cave',  '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'Sloper City',      13,  'pink',   'comp-wall',      '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'Tech Master',      15,  'white',  'slab-wall',      '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Roof Rider',       15,  'black',  'overhang-cave',  '20000000-0000-0000-0000-000000000002', 'active'),

  -- V7–V8: Expert routes
  ('30000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'Crimp Nightmare',  18,  'red',    'vert-wall',      '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'Campus King',      20,  'orange', 'overhang-cave',  '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'The Beast',        20,  'black',  'comp-wall',      '20000000-0000-0000-0000-000000000002', 'retiring_soon'),

  -- V9–V10: Elite routes
  ('30000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'Moonboard Madness',23,  'blue',   'training-area',  '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', 'Project Alpha',    25,  'purple', 'comp-wall',      '20000000-0000-0000-0000-000000000002', 'active'),

  -- Extra variety: duplicate grades + retiring/archived
  ('30000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000001', 'Old School',        5,  'green',  'vert-wall',      '20000000-0000-0000-0000-000000000002', 'retiring_soon'),
  ('30000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000001', 'Retired Classic',  10,  'white',  'slab-wall',      '20000000-0000-0000-0000-000000000002', 'archived')
ON CONFLICT (id) DO NOTHING;


-- ===========================================================================
-- Section 6: Route-Tag Associations (14 links)
-- ===========================================================================
-- Link routes to style tags with vote_counts representing how many climbers
-- agree the tag fits. This data powers the "style" section on route detail pages.
INSERT INTO public.route_style_tags (route_id, tag_id, vote_count) VALUES
  -- Baby Steps (V0 slab) — slab, juggy
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 8),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000006', 6),
  -- Crimpy Corner (V3) — crimpy
  ('30000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000003', 10),
  -- Balance Act (V3 slab) — slab, techy
  ('30000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000001', 7),
  ('30000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000007', 5),
  -- Dyno Drama (V4 overhang) — overhang, dyno
  ('30000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000002', 9),
  ('30000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000005', 10),
  -- Power Play (V5 overhang) — overhang, crimpy
  ('30000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000002', 7),
  ('30000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000003', 4),
  -- Sloper City (V5 comp) — slopey, comp-style
  ('30000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000004', 9),
  ('30000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000008', 6),
  -- Tech Master (V6 slab) — slab, techy
  ('30000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000001', 8),
  ('30000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000007', 9),
  -- Crimp Nightmare (V7) — crimpy, overhang
  ('30000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000003', 10)
ON CONFLICT (route_id, tag_id) DO NOTHING;


-- ===========================================================================
-- Section 7: Ascents (12 ascents — triggers auto-populate gamification)
-- ===========================================================================
-- CRITICAL: Each INSERT fires the on_ascent_insert trigger which calls:
--   1. recompute_streak()      → populates user_streaks
--   2. check_and_award_badges() → populates user_badges
--   3. check_grade_consensus()  → updates routes.consensus_grade (if ≥5)
--   4. compute_leaderboard()    → populates leaderboard_entries
--
-- We do NOT manually insert into user_badges, user_streaks, or leaderboard_entries.
--
-- Timestamp strategy: Spread ascents across 4 consecutive weeks relative to
-- now() so the climber earns a 4-week streak → triggers "Weekly Warrior" badge.
--
-- Grade coverage: Alex's ascents cover grades 0, 2, 5, 8, 10, 13, 15, 18, 20
-- → earns "First V0" through "First V8" badges (9 grade badges) plus
-- "First Send" and "10 Sends" volume badges = 12+ total badges.
--
-- Consensus trigger: 5+ ascents on route 30..001 with perceived_grade values
-- triggers check_grade_consensus() to compute a consensus_grade for that route.

-- Week 1 (3 weeks ago): Alex starts climbing — earns First Send + grade badges
INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'flash', 1, 0, now() - interval '3 weeks');

INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
   'flash', 1, 2, now() - interval '3 weeks');

INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003',
   'send', 3, 5, now() - interval '3 weeks');

-- Week 2 (2 weeks ago): Alex progresses to harder grades
INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000004',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004',
   'send', 4, 8, now() - interval '2 weeks');

INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000005',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000006',
   'send', 2, 10, now() - interval '2 weeks');

INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000006',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000008',
   'send', 5, 13, now() - interval '2 weeks');

-- Week 3 (1 week ago): Alex sends V6–V8 routes
INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000007',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000010',
   'flash', 1, 15, now() - interval '1 week');

INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000008',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000012',
   'send', 6, 18, now() - interval '1 week');

INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000009',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000013',
   'send', 8, 20, now() - interval '1 week');

-- Week 4 (this week): Alex keeps the streak alive + re-climbs Baby Steps
INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000010',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'flash', 1, 0, now());

-- Sam Setter logs 2 ascents (setters climb too!)
INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000011',
   '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
   'flash', 1, 0, now() - interval '1 week');

INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000012',
   '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000004',
   'send', 2, 8, now() - interval '1 week');


-- ===========================================================================
-- Section 8: Season
-- ===========================================================================
-- A named time period for organizing leaderboards and competitions.
-- "Spring 2026" runs from January to June and is currently active.
INSERT INTO public.seasons (id, gym_id, name, start_date, end_date, status)
VALUES (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Spring 2026',
  '2026-01-01',
  '2026-06-30',
  'active'
)
ON CONFLICT (id) DO NOTHING;


-- ===========================================================================
-- Section 9: Saved Routes
-- ===========================================================================
-- Alex saves routes for later — one as a "project" (working on it) and
-- one as a "wishlist" (wants to try). These appear on the user's profile
-- under saved/bookmarked routes.
INSERT INTO public.saved_routes (user_id, route_id, save_type) VALUES
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000015', 'project'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000016', 'wishlist')
ON CONFLICT (user_id, route_id, save_type) DO NOTHING;


-- ===========================================================================
-- Section 10: Notifications
-- ===========================================================================
-- Two sample notifications for Alex. In production, notifications are created
-- by SECURITY DEFINER triggers (Phase 10), but for dev data we insert directly.
-- The superuser role used during seed.sql bypasses the RLS INSERT restriction.
INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
  ('20000000-0000-0000-0000-000000000001', 'general',
   'Welcome to Summit!',
   'Thanks for joining Summit Climbing Gym. Start logging your sends!',
   '{"screen": "home"}'::jsonb),
  ('20000000-0000-0000-0000-000000000001', 'badge_earned',
   'New Badge: First Send!',
   'You earned the "First Send" badge. Keep climbing!',
   '{"badge_name": "First Send"}'::jsonb);


-- ===========================================================================
-- Section 11: Maintenance Ticket
-- ===========================================================================
-- Alex reports a spinning hold on Crimpy Corner. This shows up in the
-- setter's maintenance queue for triage.
INSERT INTO public.maintenance_tickets (route_id, reporter_id, description, status)
VALUES (
  '30000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000001',
  'Spinning hold on move 3 — the left-hand crimp rotates when weighted.',
  'open'
);


-- ===========================================================================
-- Section 12: Additional Gyms (for map testing)
-- ===========================================================================
-- The map screen needs multiple gym markers to test search, scroll, and
-- the favorites filter. These gyms are spread across Lisbon, Porto, and
-- the Algarve so they cluster naturally when zoomed out and separate when
-- zoomed in. All real Portuguese climbing gyms with verified addresses.

INSERT INTO public.gyms (id, name, address, latitude, longitude, social_links, default_grade_system, operating_hours)
VALUES
  -- Lisbon gyms
  ('10000000-0000-0000-0000-000000000002',
   '9.8 Gravity Climbing',
   'Av. Severiano Falcão 3B, 2685-379 Prior Velho',
   38.7960, -9.1230,
   '{"instagram": "@9.8_gravity_climbing", "website": "https://98gravity.pt"}'::jsonb,
   'font',
   '{"monday":{"open":"10:00","close":"23:00"},"tuesday":{"open":"10:00","close":"23:00"},"wednesday":{"open":"10:00","close":"23:00"},"thursday":{"open":"10:00","close":"23:00"},"friday":{"open":"10:00","close":"23:00"},"saturday":{"open":"10:00","close":"23:00"},"sunday":{"open":"10:00","close":"23:00"}}'::jsonb),

  ('10000000-0000-0000-0000-000000000003',
   'Escala25',
   'Av. da Índia, Pilar 7 da Ponte 25 de Abril, 1349-028 Lisboa',
   38.6945, -9.1790,
   '{"instagram": "@escala25", "website": "https://escala25.com"}'::jsonb,
   'font',
   '{"monday":{"open":"14:00","close":"22:00"},"tuesday":{"open":"10:00","close":"22:00"},"wednesday":{"open":"10:00","close":"22:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"10:00","close":"21:00"},"saturday":{"open":"10:00","close":"18:00"},"sunday":{"open":"10:00","close":"18:00"}}'::jsonb),

  -- Porto gyms
  ('10000000-0000-0000-0000-000000000004',
   'São Rock Climbing',
   'R. de Godim 312, 4300-277 Porto',
   41.1490, -8.5850,
   '{"instagram": "@saorockclimbing", "website": "http://saorockclimbing.com"}'::jsonb,
   'font',
   '{"monday":{"open":"16:00","close":"22:00"},"tuesday":{"open":"08:30","close":"22:00"},"wednesday":{"open":"08:30","close":"22:00"},"thursday":{"open":"08:30","close":"22:00"},"friday":{"open":"08:30","close":"22:00"},"saturday":{"open":"10:00","close":"20:00"}}'::jsonb),

  ('10000000-0000-0000-0000-000000000005',
   'The North Wall',
   'R. do Tronco 375, Núcleo Empresarial SARCOL, São Mamede de Infesta',
   41.1870, -8.6050,
   '{"instagram": "@thenorthwallclimbing", "website": "https://thenorthwall.pt"}'::jsonb,
   'font',
   '{"monday":{"open":"10:00","close":"22:00"},"tuesday":{"open":"10:00","close":"22:00"},"wednesday":{"open":"10:00","close":"22:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"10:00","close":"22:00"},"saturday":{"open":"10:00","close":"18:00"},"sunday":{"open":"10:00","close":"14:00"}}'::jsonb),

  -- Porto / Matosinhos / Gaia area
  ('10000000-0000-0000-0000-000000000007',
   'PROA Climbing Center',
   'Av. Menéres 858, 4450-189 Matosinhos',
   41.1820, -8.6890,
   '{"instagram": "@proaclimbingcenter", "website": "https://proaclimbingcenter.com"}'::jsonb,
   'font',
   '{"monday":{"open":"10:00","close":"20:00"},"tuesday":{"open":"16:00","close":"22:00"},"wednesday":{"open":"10:00","close":"22:00"},"thursday":{"open":"10:00","close":"22:00"},"friday":{"open":"10:00","close":"22:00"},"saturday":{"open":"10:00","close":"20:00"},"sunday":{"open":"10:00","close":"20:00"}}'::jsonb),

  ('10000000-0000-0000-0000-000000000008',
   'Zone Climb',
   'Tv. Joaquim Lopes Pintor 81, 4400-750 Vila Nova de Gaia',
   41.1114, -8.6210,
   '{"instagram": "@zoneclimbpt", "website": "https://zone.com.pt"}'::jsonb,
   'font',
   '{"monday":{"open":"07:00","close":"22:00"},"tuesday":{"open":"07:00","close":"22:00"},"wednesday":{"open":"07:00","close":"22:00"},"thursday":{"open":"07:00","close":"22:00"},"friday":{"open":"07:00","close":"22:00"},"saturday":{"open":"10:00","close":"20:00"},"sunday":{"open":"10:00","close":"20:00"}}'::jsonb),

  -- Algarve
  ('10000000-0000-0000-0000-000000000006',
   'Vertical Escalada',
   'R. Eça de Queiroz, 8400-018 Lagoa',
   37.1350, -8.4530,
   '{"instagram": "@verticalescalada.pt", "website": "https://verticalescalada.pt"}'::jsonb,
   'font',
   '{"monday":{"open":"17:00","close":"22:00"},"tuesday":{"open":"17:00","close":"22:00"},"wednesday":{"open":"17:00","close":"22:00"},"thursday":{"open":"17:00","close":"22:00"},"friday":{"open":"17:00","close":"22:00"},"saturday":{"open":"10:00","close":"18:00"}}'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- ===========================================================================
-- Section 13: Routes at Additional Gyms (6 routes each)
-- ===========================================================================
-- Each gym gets a spread of beginner → advanced routes so the route list
-- screen has variety when filtering by grade. Sam Setter is used as the
-- setter for simplicity (in production, each gym would have its own setters).

-- 9.8 Gravity routes (gym 002) — bouldering focus
INSERT INTO public.routes (id, gym_id, name, canonical_grade, color, wall_section, setter_id, status) VALUES
  ('30000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000002', 'Jug Haul',           0,  'green',  'main-floor',   '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000002', 'Pinch Fest',         5,  'blue',   'boulder-cave',  '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000002', 'The Prow',           8,  'orange', 'arete-wall',    '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000002', 'Heel Hook Heaven',  13,  'red',    'overhang-wall', '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000105', '10000000-0000-0000-0000-000000000002', 'Compression Test',  18,  'purple', 'boulder-cave',  '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000106', '10000000-0000-0000-0000-000000000002', 'Limit Breaker',     25,  'black',  'comp-wall',     '20000000-0000-0000-0000-000000000002', 'active')
ON CONFLICT (id) DO NOTHING;

-- Escala25 routes (gym 003) — sport climbing at the bridge
INSERT INTO public.routes (id, gym_id, name, canonical_grade, color, wall_section, setter_id, status) VALUES
  ('30000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000003', 'Volume Cruise',      2,  'yellow', 'zone-a',       '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000202', '10000000-0000-0000-0000-000000000003', 'Coordination',       8,  'green',  'zone-b',       '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000203', '10000000-0000-0000-0000-000000000003', 'Paddle Dyno',       10,  'pink',   'zone-a',       '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000204', '10000000-0000-0000-0000-000000000003', 'Toe Hook Traverse',  15, 'white',  'zone-c',       '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000205', '10000000-0000-0000-0000-000000000003', 'Roof Problem',      20,  'red',    'zone-b',       '20000000-0000-0000-0000-000000000002', 'retiring_soon'),
  ('30000000-0000-0000-0000-000000000206', '10000000-0000-0000-0000-000000000003', 'World Cup Final',   23,  'blue',   'comp-wall',    '20000000-0000-0000-0000-000000000002', 'active')
ON CONFLICT (id) DO NOTHING;

-- São Rock routes (gym 004) — indoor climbing, mixed grades
INSERT INTO public.routes (id, gym_id, name, canonical_grade, color, wall_section, setter_id, status) VALUES
  ('30000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000004', 'Warm Up',            0,  'green',  'beginner-wall', '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000004', 'Layback Crack',      5,  'yellow', 'trad-wall',     '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000303', '10000000-0000-0000-0000-000000000004', 'Smear Campaign',    10,  'orange', 'slab-wall',     '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000304', '10000000-0000-0000-0000-000000000004', 'Undercling Alley',  13,  'red',    'overhang-wall', '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000305', '10000000-0000-0000-0000-000000000004', 'Campus Board King', 20,  'black',  'training-area', '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000306', '10000000-0000-0000-0000-000000000004', 'The Eliminator',    25,  'purple', 'comp-wall',     '20000000-0000-0000-0000-000000000002', 'retiring_soon')
ON CONFLICT (id) DO NOTHING;

-- The North Wall routes (gym 005) — largest climbing space in Portugal
INSERT INTO public.routes (id, gym_id, name, canonical_grade, color, wall_section, setter_id, status) VALUES
  ('30000000-0000-0000-0000-000000000401', '10000000-0000-0000-0000-000000000005', 'Rainbow Jug',        0,  'rainbow', 'kids-wall',   '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000402', '10000000-0000-0000-0000-000000000005', 'Frog Reach',         2,  'green',   'kids-wall',   '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000403', '10000000-0000-0000-0000-000000000005', 'Slippery Slope',     5,  'blue',    'slab-wall',   '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000404', '10000000-0000-0000-0000-000000000005', 'Monkey Bars',        8,  'yellow',  'overhang',    '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000405', '10000000-0000-0000-0000-000000000005', 'Iron Fingers',      15,  'red',     'main-wall',   '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000406', '10000000-0000-0000-0000-000000000005', 'Stonecutter',       18,  'black',   'main-wall',   '20000000-0000-0000-0000-000000000002', 'active')
ON CONFLICT (id) DO NOTHING;

-- Vertical Escalada routes (gym 006, Lagoa) — Algarve climbing
INSERT INTO public.routes (id, gym_id, name, canonical_grade, color, wall_section, setter_id, status) VALUES
  ('30000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000006', 'First Lead',         0,  'green',  'lead-wall-a',  '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000006', 'Clip and Go',        5,  'blue',   'lead-wall-a',  '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000503', '10000000-0000-0000-0000-000000000006', 'Endurance Test',    10,  'yellow', 'lead-wall-b',  '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000504', '10000000-0000-0000-0000-000000000006', 'Pump Clock',        15,  'orange', 'lead-wall-b',  '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000505', '10000000-0000-0000-0000-000000000006', 'Red Point Project', 20,  'red',    'lead-wall-c',  '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000506', '10000000-0000-0000-0000-000000000006', 'Onsight or Bust',   23,  'white',  'lead-wall-c',  '20000000-0000-0000-0000-000000000002', 'active')
ON CONFLICT (id) DO NOTHING;

-- PROA Climbing Center routes (gym 007, Matosinhos) — bouldering
INSERT INTO public.routes (id, gym_id, name, canonical_grade, color, wall_section, setter_id, status) VALUES
  ('30000000-0000-0000-0000-000000000601', '10000000-0000-0000-0000-000000000007', 'Sea Breeze',         0,  'green',  'main-floor',    '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000602', '10000000-0000-0000-0000-000000000007', 'Porto Traverse',     5,  'blue',   'traverse-wall', '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000603', '10000000-0000-0000-0000-000000000007', 'Granite Grip',       8,  'orange', 'main-floor',    '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000604', '10000000-0000-0000-0000-000000000007', 'Atlantic Wall',     13,  'red',    'overhang-wall', '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000605', '10000000-0000-0000-0000-000000000007', 'Matosinhos Power',  18,  'purple', 'comp-wall',     '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000606', '10000000-0000-0000-0000-000000000007', 'Oceanic Project',   25,  'black',  'comp-wall',     '20000000-0000-0000-0000-000000000002', 'active')
ON CONFLICT (id) DO NOTHING;

-- Zone Climb routes (gym 008, Vila Nova de Gaia) — bouldering + crossfit space
INSERT INTO public.routes (id, gym_id, name, canonical_grade, color, wall_section, setter_id, status) VALUES
  ('30000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000008', 'Gaia Intro',         0,  'green',  'main-floor',    '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000702', '10000000-0000-0000-0000-000000000008', 'Volume Hop',         5,  'yellow', 'main-floor',    '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000703', '10000000-0000-0000-0000-000000000008', 'River View',        10,  'blue',   'slab-wall',     '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000704', '10000000-0000-0000-0000-000000000008', 'Steel Bridge',      13,  'orange', 'overhang-wall', '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000705', '10000000-0000-0000-0000-000000000008', 'Port Wine Power',   18,  'red',    'comp-wall',     '20000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000706', '10000000-0000-0000-0000-000000000008', 'Douro Dyno',        23,  'purple', 'comp-wall',     '20000000-0000-0000-0000-000000000002', 'active')
ON CONFLICT (id) DO NOTHING;


-- ===========================================================================
-- Section 14: Alex's Ascents at Other Gyms
-- ===========================================================================
-- Gives Alex a presence at multiple gyms so the app has ascent history
-- beyond Summit. These fire the gamification triggers (streak, badges,
-- leaderboards) for those gyms too.

-- Vertical World — Alex visited last week
INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000101',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101',
   'flash', 1, 0, now() - interval '5 days');

INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000102',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000103',
   'send', 3, 8, now() - interval '5 days');

INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000103',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000104',
   'send', 5, 13, now() - interval '5 days');

-- The Circuit — Alex visited yesterday
INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000201',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000201',
   'flash', 1, 2, now() - interval '1 day');

INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
  ('50000000-0000-0000-0000-000000000202',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000203',
   'send', 2, 10, now() - interval '1 day');


-- ===========================================================================
-- Section 15: Saved Route Favorites
-- ===========================================================================
-- The Route Detail screen checks saved_routes with save_type = 'favorite'
-- to show the star icon as filled/unfilled. These give Alex some pre-
-- favorited routes so the toggle state is visible when testing.
INSERT INTO public.saved_routes (user_id, route_id, save_type) VALUES
  -- Summit favorites: Alex's go-to warm-up and project
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'favorite'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000008', 'favorite'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000013', 'favorite'),
  -- Vertical World favorite
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000104', 'favorite'),
  -- The Circuit favorite
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000203', 'favorite')
ON CONFLICT (user_id, route_id, save_type) DO NOTHING;


-- ===========================================================================
-- Section 16: Route Feedback (beta tips)
-- ===========================================================================
-- Route Detail will eventually show beta tips from other climbers.
-- Seeding a few gives content for when that feature is wired up.
INSERT INTO public.route_feedback (id, route_id, user_id, body, score) VALUES
  ('70000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000004',
   '20000000-0000-0000-0000-000000000002',
   'Match on the second hold before reaching for the crimp — much more stable.',
   3),
  ('70000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000008',
   '20000000-0000-0000-0000-000000000002',
   'Drop knee on the left side to get the clip. Don''t campus it.',
   5),
  ('70000000-0000-0000-0000-000000000003',
   '30000000-0000-0000-0000-000000000007',
   '20000000-0000-0000-0000-000000000001',
   'The dyno is shorter if you use the right foot chip — most people miss it.',
   7),
  ('70000000-0000-0000-0000-000000000004',
   '30000000-0000-0000-0000-000000000013',
   '20000000-0000-0000-0000-000000000003',
   'Lock off hard on the undercling before committing to the throw. Feet are everything here.',
   2)
ON CONFLICT (id) DO NOTHING;


-- ===========================================================================
-- Section 17: Follows (social graph)
-- ===========================================================================
-- Wire up follow relationships between the three seed users.
-- This data will be used when the Activity Feed and profile screens
-- display follower/following counts and social activity.
INSERT INTO public.follows (follower_id, following_id) VALUES
  -- Alex follows Sam and Jordan
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003'),
  -- Sam follows Alex
  ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
  -- Jordan follows Alex and Sam
  ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002')
ON CONFLICT (follower_id, following_id) DO NOTHING;
