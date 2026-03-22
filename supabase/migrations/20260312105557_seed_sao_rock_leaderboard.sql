-- ===========================================================================
-- Data Migration: Seed São Rock Climbing leaderboard + ascents
-- ===========================================================================
-- Alex's favorite gym (10000000-...-004) had no leaderboard or ascents on
-- the remote DB. This adds a leaderboard and some ascents so the gym
-- leaderboard page has visible data.
--
-- The ascent inserts are guarded by a profile check because on local
-- `db reset`, migrations run before seed.sql (which creates profiles).
-- On the remote, profiles already exist so the inserts succeed.

-- Create leaderboards for São Rock (gym 004)
INSERT INTO public.leaderboards (id, gym_id, name, scoring_model, starts_at, ends_at) VALUES
  ('90000000-0000-0000-0000-000000000006',
   '10000000-0000-0000-0000-000000000004',
   'Porto Power Month', 'hardest_grade',
   '2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'),
  ('90000000-0000-0000-0000-000000000007',
   '10000000-0000-0000-0000-000000000004',
   'Volume Challenge', 'volume',
   '2026-02-01T00:00:00Z', '2026-04-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Conditionally insert ascents and recompute — only if seed profiles exist.
-- On local db reset, seed.sql handles this; on remote, profiles are already present.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '20000000-0000-0000-0000-000000000001') THEN
    INSERT INTO public.route_ascents (id, user_id, route_id, status, attempts, perceived_grade, created_at) VALUES
      ('50000000-0000-0000-0000-000000000301',
       '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000301',
       'flash', 1, 0, '2026-02-15T10:00:00Z'),
      ('50000000-0000-0000-0000-000000000302',
       '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000303',
       'send', 2, 10, '2026-02-15T11:00:00Z'),
      ('50000000-0000-0000-0000-000000000303',
       '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000304',
       'send', 4, 13, '2026-02-16T10:00:00Z'),
      ('50000000-0000-0000-0000-000000000304',
       '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000305',
       'send', 7, 20, '2026-02-16T11:00:00Z')
    ON CONFLICT (id) DO NOTHING;

    -- Recompute leaderboards to pick up the new ascents
    PERFORM compute_leaderboard('90000000-0000-0000-0000-000000000006');
    PERFORM compute_leaderboard('90000000-0000-0000-0000-000000000007');
  END IF;
END $$;
