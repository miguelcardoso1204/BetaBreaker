-- ===========================================================================
-- Migration: Seed Default Badge Definitions (Step 2.4)
-- ===========================================================================
-- Inserts 18 default badge definitions into the badges table created by
-- the Step 2.3 migration. These badges are the foundation of the gamification
-- system — the check_and_award_badges() trigger function loops over this
-- table to determine what to award.
--
-- Why seed badges in a migration instead of seed.sql?
-- ────────────────────────────────────────────────────
-- seed.sql only runs during `supabase db reset` (local dev). Migrations run
-- in EVERY environment (staging, production, CI). Badge definitions are
-- required for the app to function — without them, the trigger that awards
-- badges would loop over an empty table and never award anything. Putting
-- them in a migration guarantees they exist everywhere.
--
-- Badge categories:
-- ─────────────────
-- 1. first_grade (11 badges) — Awarded when a user sends a route at a
--    specific canonical grade for the first time. The criteria_value is
--    the FIRST canonical integer that maps to each V-grade in GRADE_TABLE
--    (see utils/grades.ts). For example, V5 first appears at canonical 13.
--
-- 2. total_sends (4 badges) — Awarded when cumulative successful ascents
--    (flash + send, not attempt) reach the threshold. Milestones: 1, 10, 50, 100.
--
-- 3. streak_weeks (3 badges) — Awarded when the user's current weekly
--    streak reaches the threshold. Weeks: 4, 8, 12.
--
-- ON CONFLICT (name) DO NOTHING makes this migration idempotent — if badges
-- already exist (e.g., from a previous partial run), duplicate rows are
-- silently skipped rather than causing an error.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Grade badges (11): "First V0" through "First V10"
-- ---------------------------------------------------------------------------
-- Each criteria_value maps to the first index in GRADE_TABLE where that
-- V-grade appears. This ensures the badge is awarded when the user sends
-- a route at exactly that canonical difficulty.
--
-- Canonical → V-grade mapping (from utils/grades.ts GRADE_TABLE):
--   0  → V0    2  → V1    5  → V2    8  → V3   10 → V4
--   13 → V5   15 → V6   18 → V7   20 → V8   23 → V9   25 → V10
INSERT INTO public.badges (name, description, icon_key, criteria_type, criteria_value) VALUES
  ('First V0',  'Send your first V0 route',  'badge-v0',  'first_grade', 0),
  ('First V1',  'Send your first V1 route',  'badge-v1',  'first_grade', 2),
  ('First V2',  'Send your first V2 route',  'badge-v2',  'first_grade', 5),
  ('First V3',  'Send your first V3 route',  'badge-v3',  'first_grade', 8),
  ('First V4',  'Send your first V4 route',  'badge-v4',  'first_grade', 10),
  ('First V5',  'Send your first V5 route',  'badge-v5',  'first_grade', 13),
  ('First V6',  'Send your first V6 route',  'badge-v6',  'first_grade', 15),
  ('First V7',  'Send your first V7 route',  'badge-v7',  'first_grade', 18),
  ('First V8',  'Send your first V8 route',  'badge-v8',  'first_grade', 20),
  ('First V9',  'Send your first V9 route',  'badge-v9',  'first_grade', 23),
  ('First V10', 'Send your first V10 route', 'badge-v10', 'first_grade', 25)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Volume badges (4): Cumulative send milestones
-- ---------------------------------------------------------------------------
-- These track total lifetime sends (flash + send status). Attempts don't
-- count because check_and_award_badges() exits early for 'attempt' status,
-- and the total_sends count query filters to status IN ('flash', 'send').
INSERT INTO public.badges (name, description, icon_key, criteria_type, criteria_value) VALUES
  ('First Send', 'Complete your first route',   'badge-first-send', 'total_sends', 1),
  ('10 Sends',   'Complete 10 routes',           'badge-10-sends',  'total_sends', 10),
  ('50 Sends',   'Complete 50 routes',           'badge-50-sends',  'total_sends', 50),
  ('100 Sends',  'Complete 100 routes',          'badge-100-sends', 'total_sends', 100)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Streak badges (3): Weekly climbing consistency milestones
-- ---------------------------------------------------------------------------
-- The check_and_award_badges() function reads current_streak from
-- user_streaks (which was just updated by recompute_streak earlier in the
-- trigger chain) and compares it against criteria_value.
--
-- Note: The freeze mechanic means a gap of 2 weeks (one missed week) still
-- counts as consecutive. So "4 weeks" could actually span 5 calendar weeks
-- if one was missed. This matches the TypeScript streak logic.
INSERT INTO public.badges (name, description, icon_key, criteria_type, criteria_value) VALUES
  ('Weekly Warrior',  'Climb every week for 4 weeks',  'badge-warrior',     'streak_weeks', 4),
  ('Monthly Machine', 'Climb every week for 8 weeks',  'badge-machine',     'streak_weeks', 8),
  ('Unstoppable',     'Climb every week for 12 weeks', 'badge-unstoppable', 'streak_weeks', 12)
ON CONFLICT (name) DO NOTHING;
