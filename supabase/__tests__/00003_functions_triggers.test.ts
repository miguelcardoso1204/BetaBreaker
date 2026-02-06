/**
 * Integration tests for database functions and triggers (Step 2.3).
 *
 * These tests verify the gamification infrastructure:
 *   - 4 new tables: badges, user_badges, user_streaks, leaderboard_entries
 *   - Schema change: routes.consensus_grade column
 *   - 4 RLS policies: SELECT-only on each new table (writes via SECURITY DEFINER)
 *   - 7 functions: handle_new_user, recompute_streak, check_and_award_badges,
 *     check_grade_consensus, compute_leaderboard, on_ascent_insert, on_ascent_delete
 *   - 3 triggers: on_auth_user_created, on_ascent_inserted, on_ascent_deleted
 *
 * Why SECURITY DEFINER for trigger functions?
 * ─────────────────────────────────────────────
 * The trigger functions fire in the context of the `authenticated` role (the
 * user who inserted the ascent). They need to write to user_badges, user_streaks,
 * and leaderboard_entries, which have NO INSERT/UPDATE policies for `authenticated`.
 * SECURITY DEFINER lets them run as the function owner (postgres), bypassing RLS.
 * This pattern is safe because:
 *   1. The functions only operate on the triggering user's data
 *   2. SET search_path = '' prevents search_path hijacking
 *   3. All table references are fully qualified (public.table_name)
 *
 * Test data approach:
 * ──────────────────
 * Unlike 00001/00002, these tests do NOT manually INSERT profiles after
 * creating auth users — the handle_new_user trigger does that automatically.
 * Where we need manual profile creation (e.g., creating data as superuser
 * before the trigger exists in the transaction), we use ON CONFLICT DO NOTHING.
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - All 3 migrations applied: `npx supabase db reset`
 */

import { Client } from 'pg';

/**
 * Connection string for the local Supabase Postgres instance.
 * Port 54322 is the default for `supabase start`.
 * We connect as the `postgres` superuser for setup and assertions.
 */
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Shared client for all tests — connected once in beforeAll, closed in afterAll
let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

// ===========================================================================
// Test Helpers
// ===========================================================================

/**
 * Creates a test user in auth.users. The handle_new_user trigger will
 * automatically create a corresponding profile row.
 *
 * @param txClient - Postgres client (inside a transaction)
 * @param email - Unique email for the test user
 * @param displayName - Optional display_name passed via raw_user_meta_data
 * @returns The UUID of the created user
 */
async function createTestUser(
  txClient: Client,
  email: string,
  displayName?: string,
): Promise<string> {
  // raw_user_meta_data is a JSONB column that Supabase Auth populates from
  // the sign-up request. Our handle_new_user trigger reads display_name from it.
  const metaData = displayName
    ? JSON.stringify({ display_name: displayName })
    : '{}';

  const result = await txClient.query(
    `INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token,
      raw_user_meta_data
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated', $1,
      crypt('password123', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', '',
      $2::jsonb
    ) RETURNING id`,
    [email, metaData]
  );
  return result.rows[0].id;
}

/**
 * Switches the Postgres session to act as an authenticated user.
 * Simulates PostgREST's behavior when a valid JWT is present.
 */
// Exported for use in future test files (Step 2.4+)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function setAuthenticatedUser(txClient: Client, userId: string): Promise<void> {
  await txClient.query(`SET LOCAL role = 'authenticated'`);
  await txClient.query(
    `SET LOCAL "request.jwt.claims" = '${JSON.stringify({
      sub: userId,
      role: 'authenticated',
    })}'`
  );
  await txClient.query(`SET LOCAL "request.jwt.claim.sub" = '${userId}'`);
}

/**
 * Resets the session back to the postgres superuser.
 * Needed after switching to authenticated to perform superuser-only operations.
 */
// Exported for use in future test files (Step 2.4+)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function resetToSuperuser(txClient: Client): Promise<void> {
  await txClient.query('RESET role');
}

/**
 * Creates a test gym. Returns the gym's UUID.
 */
async function createTestGym(txClient: Client, name: string): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO gyms (name, default_grade_system)
     VALUES ($1, 'v-scale') RETURNING id`,
    [name]
  );
  return result.rows[0].id;
}

/**
 * Creates a route at a gym with a specific grade. Returns the route's UUID.
 */
async function createTestRoute(
  txClient: Client,
  gymId: string,
  canonicalGrade: number,
): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO routes (gym_id, canonical_grade)
     VALUES ($1, $2) RETURNING id`,
    [gymId, canonicalGrade]
  );
  return result.rows[0].id;
}

/**
 * Inserts an ascent with an explicit created_at date.
 * This is critical for streak testing — we need ascents in specific weeks.
 *
 * @param txClient - Postgres client
 * @param userId - The climber's UUID
 * @param routeId - The route's UUID
 * @param status - 'flash', 'send', or 'attempt'
 * @param createdAt - When the ascent occurred (for week-based streak logic)
 * @param perceivedGrade - Optional grade the climber thinks it should be
 * @returns The ascent's UUID
 */
async function insertAscent(
  txClient: Client,
  userId: string,
  routeId: string,
  status: string,
  createdAt: Date,
  perceivedGrade?: number,
): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO route_ascents (user_id, route_id, status, created_at, perceived_grade)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, routeId, status, createdAt.toISOString(), perceivedGrade ?? null]
  );
  return result.rows[0].id;
}

/**
 * Returns a Date for a specific Monday (ISO week start).
 * Week 1 = first Monday, week 2 = second Monday, etc.
 * Uses a fixed base date (2026-01-05, which is a Monday) for predictability.
 *
 * Why a fixed base date?
 * Tests need deterministic week boundaries. By using a known Monday and
 * adding N weeks, we always get a Monday — matching the ISO week start
 * that the streak SQL uses via date_trunc('week', created_at).
 */
function mondayOfWeek(weekNumber: number): Date {
  // 2026-01-05 is a Monday (ISO week 2 of 2026)
  const base = new Date('2026-01-05T12:00:00Z');
  const result = new Date(base);
  result.setDate(base.getDate() + (weekNumber - 1) * 7);
  return result;
}

// ===========================================================================
// Test Suite: New tables exist
// ===========================================================================

/**
 * Verify that the 4 gamification tables were created by the migration.
 * These tables are required by the trigger functions that write to them.
 */
describe('New tables exist', () => {
  it.each([
    'badges',
    'user_badges',
    'user_streaks',
    'leaderboard_entries',
  ])('table "%s" exists in public schema', async (tableName) => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    expect(result.rows).toHaveLength(1);
  });
});

// ===========================================================================
// Test Suite: Schema changes
// ===========================================================================

/**
 * Verify the ALTER TABLE that added consensus_grade to routes.
 * This column is populated by check_grade_consensus() when 5+ users
 * submit perceived_grade values for a route.
 */
describe('Schema changes', () => {
  it('routes.consensus_grade column exists with type int4', async () => {
    const result = await client.query(
      `SELECT udt_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'routes'
         AND column_name = 'consensus_grade'`
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].udt_name).toBe('int4');
  });
});

// ===========================================================================
// Test Suite: RLS enabled on new tables
// ===========================================================================

/**
 * RLS must be enabled on all new tables. Without RLS, any authenticated
 * user could directly INSERT/UPDATE/DELETE badges, streaks, etc.
 * With RLS on and only SELECT policies, writes are restricted to
 * SECURITY DEFINER trigger functions.
 */
describe('RLS enabled on new tables', () => {
  it.each([
    'badges',
    'user_badges',
    'user_streaks',
    'leaderboard_entries',
  ])('RLS is enabled on "%s"', async (tableName) => {
    const result = await client.query(
      `SELECT relrowsecurity FROM pg_class
       WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
      [tableName]
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].relrowsecurity).toBe(true);
  });
});

// ===========================================================================
// Test Suite: RLS policies on new tables
// ===========================================================================

/**
 * Each new table has exactly one SELECT policy for authenticated users.
 * No INSERT/UPDATE/DELETE policies exist — all mutations happen through
 * SECURITY DEFINER functions that bypass RLS.
 */
describe('RLS policies on new tables', () => {
  it.each([
    { policy: 'badges_select_authenticated', table: 'badges' },
    { policy: 'user_badges_select_authenticated', table: 'user_badges' },
    { policy: 'user_streaks_select_authenticated', table: 'user_streaks' },
    { policy: 'leaderboard_select_authenticated', table: 'leaderboard_entries' },
  ])(
    'policy "$policy" exists on "$table"',
    async ({ policy, table }) => {
      const result = await client.query(
        `SELECT policyname FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = $1
           AND policyname = $2`,
        [table, policy]
      );
      expect(result.rows).toHaveLength(1);
    }
  );
});

// ===========================================================================
// Test Suite: handle_new_user trigger
// ===========================================================================

/**
 * The handle_new_user trigger fires AFTER INSERT on auth.users and
 * automatically creates a profile row. This means:
 *   - No manual profile creation needed during sign-up
 *   - The trigger extracts display_name from raw_user_meta_data
 *   - ON CONFLICT DO NOTHING makes it idempotent (safe if profile already exists)
 */
describe('handle_new_user trigger', () => {
  it('auto-creates profile with default preferred_grade_system', async () => {
    await client.query('BEGIN');
    try {
      // Creating an auth user should automatically trigger profile creation
      const userId = await createTestUser(client, 'auto-profile@test.com');

      // Verify the profile was created by the trigger
      const result = await client.query(
        `SELECT id, preferred_grade_system FROM profiles WHERE id = $1`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      // Default grade system should be 'v-scale' (from the profiles table definition)
      expect(result.rows[0].preferred_grade_system).toBe('v-scale');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('extracts display_name from raw_user_meta_data', async () => {
    await client.query('BEGIN');
    try {
      // Pass display_name via meta data (simulates sign-up with a display name)
      const userId = await createTestUser(
        client,
        'display-name@test.com',
        'TestClimber42',
      );

      const result = await client.query(
        `SELECT display_name FROM profiles WHERE id = $1`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].display_name).toBe('TestClimber42');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('is idempotent — ON CONFLICT DO NOTHING if profile already exists', async () => {
    await client.query('BEGIN');
    try {
      // Create user (trigger creates profile)
      const userId = await createTestUser(client, 'idempotent@test.com');

      // Manually try to insert a profile for the same user (simulates a race condition).
      // This should NOT throw — ON CONFLICT DO NOTHING handles duplicates gracefully.
      await client.query(
        `INSERT INTO profiles (id, preferred_grade_system)
         VALUES ($1, 'v-scale')
         ON CONFLICT (id) DO NOTHING`,
        [userId]
      );

      // Should still have exactly one profile
      const result = await client.query(
        `SELECT id FROM profiles WHERE id = $1`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Streak tracking
// ===========================================================================

/**
 * The recompute_streak() function mirrors the TypeScript logic in utils/streaks.ts.
 * It uses date_trunc('week', created_at)::date to get ISO Monday starts (Postgres
 * ISO weeks start on Monday, matching startOfISOWeek from date-fns).
 *
 * Gap logic:
 *   - gap = 1 week  → consecutive (streak grows)
 *   - gap = 2 weeks → freeze (streak continues, one missed week forgiven)
 *   - gap >= 3 weeks → break (streak resets)
 *
 * The function stores current_streak, longest_streak, and last_active_date
 * in the user_streaks table. Status (active/at_risk/broken) is computed
 * at read time by the client to avoid stale state in the DB.
 */
describe('Streak tracking', () => {
  it('single ascent → current=1, longest=1', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'streak-single@test.com');
      const gymId = await createTestGym(client, 'Streak Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Insert one ascent in week 1
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));

      // Check streak was computed by the trigger
      const result = await client.query(
        `SELECT current_streak, longest_streak, last_active_date
         FROM user_streaks WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_streak).toBe(1);
      expect(result.rows[0].longest_streak).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('3 consecutive weeks → current=3', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'streak-three@test.com');
      const gymId = await createTestGym(client, 'Streak Gym 2');
      const routeId = await createTestRoute(client, gymId, 12);

      // Insert ascents in 3 consecutive weeks
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));
      await insertAscent(client, userId, routeId, 'flash', mondayOfWeek(2));
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(3));

      const result = await client.query(
        `SELECT current_streak, longest_streak
         FROM user_streaks WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_streak).toBe(3);
      expect(result.rows[0].longest_streak).toBe(3);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gap of 2 weeks → freeze (streak continues)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'streak-freeze@test.com');
      const gymId = await createTestGym(client, 'Streak Gym 3');
      const routeId = await createTestRoute(client, gymId, 8);

      // Week 1 and week 3 (gap of 2 = one missed week → freeze)
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(3));

      const result = await client.query(
        `SELECT current_streak, longest_streak
         FROM user_streaks WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      // Gap of 2 = freeze mechanic: streak continues growing
      expect(result.rows[0].current_streak).toBe(2);
      expect(result.rows[0].longest_streak).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gap of 3+ weeks → break (reset to 1)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'streak-break@test.com');
      const gymId = await createTestGym(client, 'Streak Gym 4');
      const routeId = await createTestRoute(client, gymId, 15);

      // Week 1 and week 4 (gap of 3 = two missed weeks → break)
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(4));

      const result = await client.query(
        `SELECT current_streak, longest_streak
         FROM user_streaks WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      // Gap >= 3 breaks the streak; the week 4 ascent starts a new run of 1
      expect(result.rows[0].current_streak).toBe(1);
      // But longest should still be 1 (both runs had length 1)
      expect(result.rows[0].longest_streak).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('longest exceeds current after a break', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'streak-longest@test.com');
      const gymId = await createTestGym(client, 'Streak Gym 5');
      const routeId = await createTestRoute(client, gymId, 10);

      // Build a 3-week streak, then break, then start a 1-week streak
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(2));
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(3));
      // Gap of 3 → break
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(6));

      const result = await client.query(
        `SELECT current_streak, longest_streak
         FROM user_streaks WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      // Current streak is just 1 (week 6 only), but longest was 3 (weeks 1-3)
      expect(result.rows[0].current_streak).toBe(1);
      expect(result.rows[0].longest_streak).toBe(3);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('multiple ascents in same week → streak of 1', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'streak-sameweek@test.com');
      const gymId = await createTestGym(client, 'Streak Gym 6');
      const routeId = await createTestRoute(client, gymId, 5);

      // Two ascents in the same week — should count as 1 week
      const monday = mondayOfWeek(1);
      const wednesday = new Date(monday);
      wednesday.setDate(wednesday.getDate() + 2);

      await insertAscent(client, userId, routeId, 'send', monday);
      await insertAscent(client, userId, routeId, 'flash', wednesday);

      const result = await client.query(
        `SELECT current_streak, longest_streak
         FROM user_streaks WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      // Same week = only 1 unique week, so streak is 1
      expect(result.rows[0].current_streak).toBe(1);
      expect(result.rows[0].longest_streak).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Badge awards
// ===========================================================================

/**
 * The check_and_award_badges() function loops over the badges table,
 * checks each badge's criteria against the user's ascent history,
 * and awards badges by inserting into user_badges.
 *
 * Supported criteria types:
 *   - first_grade: awarded when the user sends a route at a specific grade
 *   - total_sends: awarded when total successful ascent count reaches threshold
 *
 * Key behaviors:
 *   - Attempts don't trigger badge checks (only flash/send)
 *   - Duplicate awards are prevented by ON CONFLICT DO NOTHING (idempotent)
 *   - Badge check runs inside the ascent insert trigger
 */
describe('Badge awards', () => {
  it('first_grade badge awarded when user sends at the target grade', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'badge-first@test.com');
      const gymId = await createTestGym(client, 'Badge Gym');
      const routeId = await createTestRoute(client, gymId, 14); // V5 equivalent

      // Seed a badge definition for grade 14 with a unique name.
      // We use a distinct name to avoid conflicts with seeded badge data
      // (the seed migration already defines "First V5" at criteria_value 13).
      await client.query(
        `INSERT INTO badges (name, description, icon_key, criteria_type, criteria_value)
         VALUES ('Test Grade 14', 'Test badge for grade 14', 'badge-test', 'first_grade', 14)`
      );

      // Insert a successful ascent at grade 14 — should trigger badge award
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));

      // Check that our specific test badge was awarded (filter by name
      // to avoid counting seeded badges that may also match)
      const result = await client.query(
        `SELECT ub.badge_id FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'Test Grade 14'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('duplicate badge not awarded (idempotent)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'badge-dup@test.com');
      const gymId = await createTestGym(client, 'Badge Gym 2');
      const routeId = await createTestRoute(client, gymId, 14);

      // Use a unique name to avoid conflict with seeded badges
      await client.query(
        `INSERT INTO badges (name, description, icon_key, criteria_type, criteria_value)
         VALUES ('Test Grade 14 Dup', 'Test dedup for grade 14', 'badge-test', 'first_grade', 14)`
      );

      // Two successful ascents at the same grade — badge should only be awarded once
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));
      await insertAscent(client, userId, routeId, 'flash', mondayOfWeek(2));

      // Filter by our specific test badge to verify ON CONFLICT DO NOTHING
      const result = await client.query(
        `SELECT ub.badge_id FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'Test Grade 14 Dup'`,
        [userId]
      );
      // ON CONFLICT DO NOTHING prevents duplicate — should still be exactly 1
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('attempt does not trigger badge award', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'badge-attempt@test.com');
      const gymId = await createTestGym(client, 'Badge Gym 3');
      const routeId = await createTestRoute(client, gymId, 14);

      // Use a unique name to avoid conflict with seeded badges
      await client.query(
        `INSERT INTO badges (name, description, icon_key, criteria_type, criteria_value)
         VALUES ('Test Grade 14 Attempt', 'Test attempt for grade 14', 'badge-test', 'first_grade', 14)`
      );

      // Insert an attempt (not a send/flash) — should NOT trigger badge
      // check_and_award_badges() exits early for 'attempt' status
      await insertAscent(client, userId, routeId, 'attempt', mondayOfWeek(1));

      // No badges at all should be awarded — attempts skip the entire badge check
      const result = await client.query(
        `SELECT badge_id FROM user_badges WHERE user_id = $1`,
        [userId]
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('total_sends badge awarded at threshold', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'badge-total@test.com');
      const gymId = await createTestGym(client, 'Badge Gym 4');

      // Create 3 different routes so we can log 3 sends
      const route1 = await createTestRoute(client, gymId, 5);
      const route2 = await createTestRoute(client, gymId, 8);
      const route3 = await createTestRoute(client, gymId, 10);

      // Seed a badge for "3 total sends" with a unique name.
      // We use threshold 3 (not 1 or 10) to isolate from seeded badges.
      await client.query(
        `INSERT INTO badges (name, description, icon_key, criteria_type, criteria_value)
         VALUES ('Triple Send', 'Complete 3 routes', 'badge-triple', 'total_sends', 3)`
      );

      // First two sends — not enough for "Triple Send" (threshold = 3).
      // Note: seeded badges like "First Send" (threshold=1) and grade badges
      // will also be awarded, so we filter by our specific badge name.
      await insertAscent(client, userId, route1, 'send', mondayOfWeek(1));
      await insertAscent(client, userId, route2, 'flash', mondayOfWeek(1));

      let result = await client.query(
        `SELECT ub.badge_id FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'Triple Send'`,
        [userId]
      );
      expect(result.rows).toHaveLength(0);

      // Third send — triggers the "Triple Send" badge!
      await insertAscent(client, userId, route3, 'send', mondayOfWeek(2));

      result = await client.query(
        `SELECT ub.badge_id FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'Triple Send'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Grade consensus
// ===========================================================================

/**
 * check_grade_consensus() computes a community-sourced grade for a route.
 * When 5 or more climbers submit perceived_grade values, the median is
 * stored as consensus_grade on the route. If the count drops below 5
 * (e.g., after a delete), consensus_grade is reset to NULL.
 *
 * Why median instead of mean?
 * Median is robust to outliers. If 4 climbers say V5 and one says V10
 * (sandbagging or ego-grading), the median stays at V5. Mean would
 * be pulled up to V6, which doesn't reflect the community opinion.
 */
describe('Grade consensus', () => {
  it('4 submissions → consensus_grade stays NULL', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Consensus Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Create 4 users, each submitting a perceived_grade
      for (let i = 1; i <= 4; i++) {
        const userId = await createTestUser(client, `consensus-4-${i}@test.com`);
        await insertAscent(
          client, userId, routeId, 'send', mondayOfWeek(1),
          12, // perceived_grade
        );
      }

      // With only 4 submissions, consensus should remain NULL
      const result = await client.query(
        `SELECT consensus_grade FROM routes WHERE id = $1`,
        [routeId]
      );
      expect(result.rows[0].consensus_grade).toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('5 submissions → consensus_grade = median', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Consensus Gym 2');
      const routeId = await createTestRoute(client, gymId, 10);

      // 5 users with perceived grades: 8, 10, 12, 14, 16
      // Median of [8, 10, 12, 14, 16] = 12
      const grades = [8, 10, 12, 14, 16];
      for (let i = 0; i < 5; i++) {
        const userId = await createTestUser(client, `consensus-5-${i}@test.com`);
        await insertAscent(
          client, userId, routeId, 'send', mondayOfWeek(1),
          grades[i],
        );
      }

      const result = await client.query(
        `SELECT consensus_grade FROM routes WHERE id = $1`,
        [routeId]
      );
      // Median of [8, 10, 12, 14, 16] = 12
      expect(result.rows[0].consensus_grade).toBe(12);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('delete drops below 5 → consensus_grade reset to NULL', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Consensus Gym 3');
      const routeId = await createTestRoute(client, gymId, 10);

      // Create 5 ascents with perceived grades to establish consensus
      const ascentIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const userId = await createTestUser(client, `consensus-del-${i}@test.com`);
        const ascentId = await insertAscent(
          client, userId, routeId, 'send', mondayOfWeek(1),
          12, // all same grade for simplicity
        );
        ascentIds.push(ascentId);
      }

      // Verify consensus is set
      let result = await client.query(
        `SELECT consensus_grade FROM routes WHERE id = $1`,
        [routeId]
      );
      expect(result.rows[0].consensus_grade).toBe(12);

      // Delete one ascent — drops below 5
      await client.query(
        `DELETE FROM route_ascents WHERE id = $1`,
        [ascentIds[0]]
      );

      // Consensus should be cleared
      result = await client.query(
        `SELECT consensus_grade FROM routes WHERE id = $1`,
        [routeId]
      );
      expect(result.rows[0].consensus_grade).toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Leaderboard
// ===========================================================================

/**
 * compute_leaderboard() uses the hardest_grade scoring model:
 *   - Score = MAX(canonical_grade) among successful ascents in the period
 *   - Ranking uses RANK() OVER (ORDER BY score DESC) for 1224 ranking
 *   - Results are upserted into leaderboard_entries with ON CONFLICT DO UPDATE
 */
describe('Leaderboard', () => {
  it('ascent insert populates leaderboard entry', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'lb-basic@test.com');
      const gymId = await createTestGym(client, 'LB Gym');
      const routeId = await createTestRoute(client, gymId, 15);

      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));

      const result = await client.query(
        `SELECT user_id, score, rank FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(1);
      // Score should be the canonical grade (15) since it's the hardest_grade model
      expect(Number(result.rows[0].score)).toBe(15);
      // Only one user → rank 1
      expect(result.rows[0].rank).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('1224 ranking — two users tied, third gets rank=3', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'lb-rank1@test.com');
      const user2 = await createTestUser(client, 'lb-rank2@test.com');
      const user3 = await createTestUser(client, 'lb-rank3@test.com');
      const gymId = await createTestGym(client, 'LB Gym 2');
      const route15 = await createTestRoute(client, gymId, 15);
      const route10 = await createTestRoute(client, gymId, 10);

      // User 1 and 2 both send grade 15 (tied)
      await insertAscent(client, user1, route15, 'send', mondayOfWeek(1));
      await insertAscent(client, user2, route15, 'flash', mondayOfWeek(1));
      // User 3 sends grade 10 (lower)
      await insertAscent(client, user3, route10, 'send', mondayOfWeek(1));

      const result = await client.query(
        `SELECT user_id, score, rank FROM leaderboard_entries
         WHERE gym_id = $1
         ORDER BY rank ASC, score DESC`,
        [gymId]
      );
      expect(result.rows).toHaveLength(3);

      // Find entries by user
      const entry1 = result.rows.find((r: { user_id: string }) => r.user_id === user1);
      const entry2 = result.rows.find((r: { user_id: string }) => r.user_id === user2);
      const entry3 = result.rows.find((r: { user_id: string }) => r.user_id === user3);

      // Users 1 and 2 tied at score 15, both rank 1
      expect(Number(entry1.score)).toBe(15);
      expect(entry1.rank).toBe(1);
      expect(Number(entry2.score)).toBe(15);
      expect(entry2.rank).toBe(1);
      // User 3 at score 10, rank 3 (not 2 — this is 1224 ranking)
      expect(Number(entry3.score)).toBe(10);
      expect(entry3.rank).toBe(3);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('ascent delete adjusts leaderboard', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'lb-delete@test.com');
      const gymId = await createTestGym(client, 'LB Gym 3');
      const route15 = await createTestRoute(client, gymId, 15);
      const route5 = await createTestRoute(client, gymId, 5);

      // Insert two ascents: one hard, one easy
      const hardAscentId = await insertAscent(
        client, userId, route15, 'send', mondayOfWeek(1),
      );
      await insertAscent(client, userId, route5, 'send', mondayOfWeek(1));

      // Leaderboard should show score 15 (hardest grade)
      let result = await client.query(
        `SELECT score FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2`,
        [gymId, userId]
      );
      expect(Number(result.rows[0].score)).toBe(15);

      // Delete the hard ascent — leaderboard should update to score 5
      await client.query(
        `DELETE FROM route_ascents WHERE id = $1`,
        [hardAscentId]
      );

      result = await client.query(
        `SELECT score FROM leaderboard_entries
         WHERE gym_id = $1 AND user_id = $2`,
        [gymId, userId]
      );
      expect(Number(result.rows[0].score)).toBe(5);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: on_ascent_delete trigger
// ===========================================================================

/**
 * The on_ascent_delete trigger fires AFTER DELETE on route_ascents.
 * It calls recompute_streak, check_grade_consensus, and compute_leaderboard
 * to update the gamification state when an ascent is removed.
 *
 * Note: it does NOT call check_and_award_badges — we don't revoke badges
 * on delete (once earned, they're permanent). This is a product decision:
 * badges represent achievements, and retroactively removing them feels bad.
 */
describe('on_ascent_delete trigger', () => {
  it('delete recomputes streak', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'del-streak@test.com');
      const gymId = await createTestGym(client, 'Del Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Build a 2-week streak
      const ascent1Id = await insertAscent(
        client, userId, routeId, 'send', mondayOfWeek(1),
      );
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(2));

      // Verify streak is 2
      let result = await client.query(
        `SELECT current_streak FROM user_streaks
         WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(result.rows[0].current_streak).toBe(2);

      // Delete the week 1 ascent — streak should drop to 1
      await client.query(
        `DELETE FROM route_ascents WHERE id = $1`,
        [ascent1Id]
      );

      result = await client.query(
        `SELECT current_streak FROM user_streaks
         WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(result.rows[0].current_streak).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('delete only ascent → streak current=0', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'del-only@test.com');
      const gymId = await createTestGym(client, 'Del Gym 2');
      const routeId = await createTestRoute(client, gymId, 10);

      // Insert and immediately delete the only ascent
      const ascentId = await insertAscent(
        client, userId, routeId, 'send', mondayOfWeek(1),
      );

      // Verify streak exists
      let result = await client.query(
        `SELECT current_streak FROM user_streaks
         WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(result.rows[0].current_streak).toBe(1);

      // Delete the only ascent
      await client.query(
        `DELETE FROM route_ascents WHERE id = $1`,
        [ascentId]
      );

      result = await client.query(
        `SELECT current_streak FROM user_streaks
         WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(result.rows[0].current_streak).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('delete ascent with perceived_grade → consensus rechecked', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Del Consensus Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Create 6 ascents with perceived grades — exceeds threshold
      const ascentIds: string[] = [];
      for (let i = 0; i < 6; i++) {
        const userId = await createTestUser(client, `del-consensus-${i}@test.com`);
        const ascentId = await insertAscent(
          client, userId, routeId, 'send', mondayOfWeek(1),
          12, // perceived_grade
        );
        ascentIds.push(ascentId);
      }

      // Verify consensus is set (6 submissions ≥ 5 threshold)
      let result = await client.query(
        `SELECT consensus_grade FROM routes WHERE id = $1`,
        [routeId]
      );
      expect(result.rows[0].consensus_grade).toBe(12);

      // Delete 2 ascents — drops to 4, below threshold
      await client.query(
        `DELETE FROM route_ascents WHERE id = $1`,
        [ascentIds[0]]
      );
      await client.query(
        `DELETE FROM route_ascents WHERE id = $1`,
        [ascentIds[1]]
      );

      result = await client.query(
        `SELECT consensus_grade FROM routes WHERE id = $1`,
        [routeId]
      );
      expect(result.rows[0].consensus_grade).toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
