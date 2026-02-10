/**
 * Verification tests for seed data (Step 2.9).
 *
 * These tests confirm that `supabase/seed.sql` populated the database
 * correctly after `supabase db reset`. Unlike other integration tests
 * that use BEGIN/ROLLBACK for isolation, these tests read persistent
 * seed data — no transactions needed.
 *
 * The seed data is deterministic (fixed UUIDs) and trigger-driven
 * (ascent inserts auto-populate badges, streaks, and leaderboards).
 * These tests validate both the explicit seed inserts and the
 * implicit trigger side-effects.
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - Database freshly reset: `npx supabase db reset`
 */

import { Client } from 'pg';

/**
 * Connection string for the local Supabase Postgres instance.
 * Port 54322 is the default for `supabase start`.
 */
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Shared client — connected once in beforeAll, closed in afterAll
let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});


// ===========================================================================
// Seed data: gym
// ===========================================================================

describe('Seed data: gym', () => {
  it('should have Summit Climbing Gym', async () => {
    // The seed inserts one gym with a known name and UUID.
    // This verifies the gym row exists and has the expected name.
    const result = await client.query(
      `SELECT name FROM public.gyms WHERE id = '10000000-0000-0000-0000-000000000001'`
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Summit Climbing Gym');
  });
});


// ===========================================================================
// Seed data: users
// ===========================================================================

describe('Seed data: users', () => {
  it('should have at least 3 profiles', async () => {
    // The seed creates 3 auth.users which trigger handle_new_user()
    // to auto-create 3 profile rows. Count confirms all 3 exist.
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.profiles`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(3);
  });

  it('should have all 3 gym roles (climber, setter, gym_admin)', async () => {
    // Each seed user has a different role at the gym. This verifies
    // the role variety needed for testing RLS policies during development.
    const result = await client.query(
      `SELECT DISTINCT role FROM public.user_gym_roles
       WHERE gym_id = '10000000-0000-0000-0000-000000000001'
       ORDER BY role`
    );
    const roles = result.rows.map((r: { role: string }) => r.role);
    expect(roles).toContain('climber');
    expect(roles).toContain('setter');
    expect(roles).toContain('gym_admin');
  });
});


// ===========================================================================
// Seed data: routes
// ===========================================================================

describe('Seed data: routes', () => {
  it('should have at least 10 routes', async () => {
    // The seed inserts 18 routes. We check for ≥10 to allow flexibility
    // if routes are added or removed in future seed updates.
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.routes`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(10);
  });

  it('should span grades from 0 to 25', async () => {
    // Routes cover V0 (grade 0) through V10 (grade 25) to exercise
    // the full grade range and trigger all grade-based badges.
    const result = await client.query(
      `SELECT min(canonical_grade) AS min_grade, max(canonical_grade) AS max_grade
       FROM public.routes`
    );
    expect(result.rows[0].min_grade).toBe(0);
    expect(result.rows[0].max_grade).toBe(25);
  });
});


// ===========================================================================
// Seed data: style tags
// ===========================================================================

describe('Seed data: style tags', () => {
  it('should have at least 8 tags', async () => {
    // The seed inserts 8 style tags covering angle, hold_type, and movement.
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.style_tags`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(8);
  });

  it('should include slab, overhang, and crimpy tags', async () => {
    // Spot-check that key tag names exist. These are commonly used
    // in climbing and essential for the route tagging feature.
    const result = await client.query(
      `SELECT name FROM public.style_tags WHERE name IN ('slab', 'overhang', 'crimpy')`
    );
    const names = result.rows.map((r: { name: string }) => r.name);
    expect(names).toContain('slab');
    expect(names).toContain('overhang');
    expect(names).toContain('crimpy');
  });
});


// ===========================================================================
// Seed data: route-tag links
// ===========================================================================

describe('Seed data: route-tag links', () => {
  it('should have at least 1 route_style_tags row', async () => {
    // The seed links routes to tags with vote counts. This verifies
    // that the many-to-many join table was populated.
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.route_style_tags`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(1);
  });
});


// ===========================================================================
// Seed data: ascents
// ===========================================================================

describe('Seed data: ascents', () => {
  it('should have at least 10 ascents', async () => {
    // The seed inserts 12 ascents (10 for Alex, 2 for Sam).
    // Each insert fires the on_ascent_insert trigger chain.
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.route_ascents`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(10);
  });
});


// ===========================================================================
// Seed data: badges (from migration)
// ===========================================================================

describe('Seed data: badges', () => {
  it('should have 19 badge definitions from the migrations', async () => {
    // Badge definitions come from migration 20260206003749_seed_badges.sql (18)
    // plus 20260210113100_add_first_flash_badge.sql (1 "First Flash").
    // 11 first_grade + 4 total_sends + 3 streak_weeks + 1 first_flash = 19 total
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.badges`
    );
    expect(result.rows[0].cnt).toBe(19);
  });
});


// ===========================================================================
// Seed data: auto-awarded badges (trigger side-effect)
// ===========================================================================

describe('Seed data: auto-awarded badges', () => {
  it('should have auto-awarded at least 1 user_badges row via trigger', async () => {
    // When seed ascents are inserted, the check_and_award_badges() trigger
    // automatically awards badges based on grade, volume, and streak criteria.
    // Alex's 10 successful ascents across grades 0–20 should earn multiple
    // grade badges plus volume badges (First Send, 10 Sends).
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.user_badges`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(1);
  });
});


// ===========================================================================
// Seed data: streaks (trigger side-effect)
// ===========================================================================

describe('Seed data: streaks', () => {
  it('should have auto-computed at least 1 user_streaks row via trigger', async () => {
    // The recompute_streak() trigger fires on every ascent insert.
    // Alex's ascents span 4 consecutive weeks, so the streak should
    // be computed and stored in user_streaks.
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.user_streaks`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(1);
  });
});


// ===========================================================================
// Seed data: leaderboard (trigger side-effect)
// ===========================================================================

describe('Seed data: leaderboard', () => {
  it('should have auto-computed at least 1 leaderboard_entries row via trigger', async () => {
    // The compute_leaderboard() trigger fires on every ascent insert.
    // It computes gym leaderboard rankings per ISO week period.
    // Alex and Sam both have ascents, so at least one entry should exist.
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.leaderboard_entries`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(1);
  });
});


// ===========================================================================
// Seed data: season
// ===========================================================================

describe('Seed data: season', () => {
  it('should have at least 1 season', async () => {
    // The seed inserts "Spring 2026" as an active season for Summit gym.
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.seasons`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(1);
  });
});


// ===========================================================================
// Seed data: saved routes
// ===========================================================================

describe('Seed data: saved routes', () => {
  it('should have at least 1 saved_routes row', async () => {
    // Alex saved two routes (one project, one wishlist).
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.saved_routes`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(1);
  });
});


// ===========================================================================
// Seed data: notifications
// ===========================================================================

describe('Seed data: notifications', () => {
  it('should have at least 1 notification', async () => {
    // The seed inserts 2 notifications for Alex (welcome + badge earned).
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.notifications`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(1);
  });
});


// ===========================================================================
// Seed data: maintenance tickets
// ===========================================================================

describe('Seed data: maintenance tickets', () => {
  it('should have at least 1 maintenance_ticket', async () => {
    // Alex reported a spinning hold on Crimpy Corner.
    const result = await client.query(
      `SELECT count(*)::int AS cnt FROM public.maintenance_tickets`
    );
    expect(result.rows[0].cnt).toBeGreaterThanOrEqual(1);
  });
});
