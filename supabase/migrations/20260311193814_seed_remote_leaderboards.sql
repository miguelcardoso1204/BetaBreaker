-- ===========================================================================
-- Data Migration: Seed Leaderboards for Existing Ascent Data
-- ===========================================================================
-- The leaderboard redesign migration created the leaderboards table and
-- updated the triggers, but existing ascent data (inserted before leaderboards
-- existed) never triggered leaderboard population. This migration:
--   1. Inserts leaderboard definitions covering the date range of existing ascents
--   2. Calls compute_leaderboard() for each to retroactively populate entries
--
-- Uses ON CONFLICT DO NOTHING so it's idempotent with seed.sql (which uses
-- different UUIDs for its leaderboard rows).

-- Gym 001 (Vertigo Climbing Center) — ascents from Jan 19 to Feb 9
INSERT INTO public.leaderboards (id, gym_id, name, scoring_model, starts_at, ends_at) VALUES
  ('90000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Winter Season', 'hardest_grade',
   '2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'),
  ('90000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   'Send It All', 'volume',
   '2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Gym 002 (9.8 Gravity) — ascents from Feb 4
INSERT INTO public.leaderboards (id, gym_id, name, scoring_model, starts_at, ends_at) VALUES
  ('90000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000002',
   'February Crush', 'hardest_grade',
   '2026-01-15T00:00:00Z', '2026-04-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Gym 003 (Escala25) — ascents from Feb 8
INSERT INTO public.leaderboards (id, gym_id, name, scoring_model, starts_at, ends_at) VALUES
  ('90000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000003',
   'Spring Showdown', 'hardest_grade',
   '2026-01-15T00:00:00Z', '2026-04-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Gym 005 (The North Wall) — ascent from Feb 20
INSERT INTO public.leaderboards (id, gym_id, name, scoring_model, starts_at, ends_at) VALUES
  ('90000000-0000-0000-0000-000000000005',
   '10000000-0000-0000-0000-000000000005',
   'Flash Season', 'flash_rate',
   '2026-01-15T00:00:00Z', '2026-04-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Retroactively compute scores from existing ascent data.
-- compute_leaderboard() scans route_ascents within the time window
-- and populates leaderboard_entries with scores and ranks.
SELECT compute_leaderboard('90000000-0000-0000-0000-000000000001');
SELECT compute_leaderboard('90000000-0000-0000-0000-000000000002');
SELECT compute_leaderboard('90000000-0000-0000-0000-000000000003');
SELECT compute_leaderboard('90000000-0000-0000-0000-000000000004');
SELECT compute_leaderboard('90000000-0000-0000-0000-000000000005');
