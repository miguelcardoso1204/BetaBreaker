/**
 * Integration tests for gamification seed data and end-to-end badge awarding (Step 2.4).
 *
 * These tests verify:
 *   - 18 default badge definitions seeded by migration (11 grade, 4 volume, 3 streak)
 *   - End-to-end badge awarding through the trigger system using seeded badges
 *   - RLS read access to gamification tables for authenticated users
 *
 * Why seed badges in a migration instead of seed.sql?
 * ────────────────────────────────────────────────────
 * Migrations are versioned, sequential, and always applied. seed.sql only runs
 * on `supabase db reset` — not on production deploys. Badge definitions are
 * essential for the app to function (triggers reference them), so they belong
 * in a migration that's guaranteed to run in every environment.
 *
 * Badge criteria_value mapping:
 * ─────────────────────────────
 * For `first_grade` badges, criteria_value is the *first* canonical integer
 * that maps to that V-grade in GRADE_TABLE (utils/grades.ts). For example,
 * GRADE_TABLE[13].v = 'V5', so "First V5" has criteria_value = 13.
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - All 4 migrations applied: `npx supabase db reset`
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
// Test Helpers (same patterns as 00003)
// ===========================================================================

/**
 * Creates a test user in auth.users. The handle_new_user trigger
 * automatically creates a corresponding profile row.
 */
async function createTestUser(
  txClient: Client,
  email: string,
  displayName?: string,
): Promise<string> {
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
 *
 * How this works:
 * - SET LOCAL role changes the session role to 'authenticated' (RLS checks this)
 * - request.jwt.claims and request.jwt.claim.sub are session variables that
 *   PostgREST sets from the decoded JWT. RLS policies read auth.uid() which
 *   internally reads request.jwt.claim.sub.
 * - LOCAL means these settings only last for the current transaction.
 */
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
 * Critical for streak testing — we need ascents in specific weeks.
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
 * Uses a fixed base date (2026-01-05, which is a Monday) for deterministic
 * week boundaries that match Postgres's date_trunc('week', ...) behavior.
 */
function mondayOfWeek(weekNumber: number): Date {
  const base = new Date('2026-01-05T12:00:00Z');
  const result = new Date(base);
  result.setDate(base.getDate() + (weekNumber - 1) * 7);
  return result;
}

// ===========================================================================
// Test Suite: Badge seed data
// ===========================================================================

/**
 * Verify that the seed migration inserted all 18 default badge definitions.
 * These badges are referenced by check_and_award_badges() — without them,
 * no badges would ever be awarded (the function loops over the badges table).
 */
describe('Badge seed data', () => {
  it('18 badge definitions exist in badges table', async () => {
    // Count all rows in the badges table — should be exactly 18
    const result = await client.query(
      `SELECT count(*) AS cnt FROM badges`
    );
    expect(Number(result.rows[0].cnt)).toBe(18);
  });

  it('all 11 first_grade badges have correct criteria_values', async () => {
    // Query all grade badges and verify their criteria_values match GRADE_TABLE.
    // The criteria_value is the first canonical integer that maps to each V-grade:
    //   V0=0, V1=2, V2=5, V3=8, V4=10, V5=13, V6=15, V7=18, V8=20, V9=23, V10=25
    const result = await client.query(
      `SELECT name, criteria_value FROM badges
       WHERE criteria_type = 'first_grade'
       ORDER BY criteria_value ASC`
    );
    expect(result.rows).toHaveLength(11);

    // Build a map of name → criteria_value for easier assertions
    const gradeMap = new Map(
      result.rows.map((r: { name: string; criteria_value: number }) => [r.name, r.criteria_value])
    );

    // Spot-check all 11 grade badges against GRADE_TABLE values
    expect(gradeMap.get('First V0')).toBe(0);
    expect(gradeMap.get('First V1')).toBe(2);
    expect(gradeMap.get('First V2')).toBe(5);
    expect(gradeMap.get('First V3')).toBe(8);
    expect(gradeMap.get('First V4')).toBe(10);
    expect(gradeMap.get('First V5')).toBe(13);
    expect(gradeMap.get('First V6')).toBe(15);
    expect(gradeMap.get('First V7')).toBe(18);
    expect(gradeMap.get('First V8')).toBe(20);
    expect(gradeMap.get('First V9')).toBe(23);
    expect(gradeMap.get('First V10')).toBe(25);
  });

  it('all 4 total_sends badges exist with expected thresholds', async () => {
    // Volume badges reward cumulative sends: 1, 10, 50, 100
    const result = await client.query(
      `SELECT name, criteria_value FROM badges
       WHERE criteria_type = 'total_sends'
       ORDER BY criteria_value ASC`
    );
    expect(result.rows).toHaveLength(4);

    const volumeMap = new Map(
      result.rows.map((r: { name: string; criteria_value: number }) => [r.name, r.criteria_value])
    );

    expect(volumeMap.get('First Send')).toBe(1);
    expect(volumeMap.get('10 Sends')).toBe(10);
    expect(volumeMap.get('50 Sends')).toBe(50);
    expect(volumeMap.get('100 Sends')).toBe(100);
  });

  it('all 3 streak_weeks badges exist with expected thresholds', async () => {
    // Streak badges reward consistency: 4, 8, 12 consecutive weeks
    const result = await client.query(
      `SELECT name, criteria_value FROM badges
       WHERE criteria_type = 'streak_weeks'
       ORDER BY criteria_value ASC`
    );
    expect(result.rows).toHaveLength(3);

    const streakMap = new Map(
      result.rows.map((r: { name: string; criteria_value: number }) => [r.name, r.criteria_value])
    );

    expect(streakMap.get('Weekly Warrior')).toBe(4);
    expect(streakMap.get('Monthly Machine')).toBe(8);
    expect(streakMap.get('Unstoppable')).toBe(12);
  });
});

// ===========================================================================
// Test Suite: End-to-end grade badges with seeded data
// ===========================================================================

/**
 * These tests verify that the trigger system correctly awards SEEDED grade badges.
 * Unlike 00003 which used ad-hoc badge rows, these use the actual seed data —
 * confirming the full pipeline from migration → trigger → user_badges.
 */
describe('End-to-end: grade badges with seeded data', () => {
  it('sending a V0 route (canonical 0) awards "First V0" badge', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'e2e-v0@test.com');
      const gymId = await createTestGym(client, 'E2E Grade Gym');
      // Canonical 0 = V0 — matches "First V0" badge (criteria_value = 0)
      const routeId = await createTestRoute(client, gymId, 0);

      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));

      // Check that the "First V0" badge was awarded
      const result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'First V0'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('sending a V5 route (canonical 13) awards "First V5" badge', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'e2e-v5@test.com');
      const gymId = await createTestGym(client, 'E2E Grade Gym 2');
      // Canonical 13 = V5 — matches "First V5" badge (criteria_value = 13)
      const routeId = await createTestRoute(client, gymId, 13);

      await insertAscent(client, userId, routeId, 'flash', mondayOfWeek(1));

      const result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'First V5'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('sending a V2 route (canonical 5) does NOT award "First V3"', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'e2e-wrong-grade@test.com');
      const gymId = await createTestGym(client, 'E2E Grade Gym 3');
      // Canonical 5 = V2, but "First V3" requires criteria_value = 8
      // The badge system checks exact grade match, not >=
      const routeId = await createTestRoute(client, gymId, 5);

      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));

      // "First V3" should NOT be awarded (grade mismatch)
      const result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'First V3'`,
        [userId]
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: End-to-end volume badges with seeded data
// ===========================================================================

/**
 * Volume badges (total_sends) track cumulative successful ascents.
 * The check_and_award_badges function counts rows in route_ascents
 * where status IN ('flash', 'send') for the user.
 */
describe('End-to-end: volume badges with seeded data', () => {
  it('first successful ascent awards "First Send" badge (threshold = 1)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'e2e-first-send@test.com');
      const gymId = await createTestGym(client, 'E2E Volume Gym');
      const routeId = await createTestRoute(client, gymId, 5);

      // One successful send — should hit the "First Send" threshold of 1
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));

      const result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'First Send'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('10th send awards "10 Sends" badge', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'e2e-10-sends@test.com');
      const gymId = await createTestGym(client, 'E2E Volume Gym 2');

      // Create 10 different routes so we can log 10 separate sends.
      // Each route needs a unique canonical_grade or same — doesn't matter
      // for volume counting, only that status is 'send' or 'flash'.
      for (let i = 0; i < 9; i++) {
        const routeId = await createTestRoute(client, gymId, i % 30);
        await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));
      }

      // After 9 sends, "10 Sends" should NOT be awarded yet
      let result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = '10 Sends'`,
        [userId]
      );
      expect(result.rows).toHaveLength(0);

      // 10th send triggers the badge
      const route10 = await createTestRoute(client, gymId, 15);
      await insertAscent(client, userId, route10, 'flash', mondayOfWeek(2));

      result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = '10 Sends'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('attempts do not count toward volume badges', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'e2e-attempts@test.com');
      const gymId = await createTestGym(client, 'E2E Volume Gym 3');

      // Log 5 attempts — these should NOT count toward "First Send"
      // because the badge system only counts flash/send statuses.
      for (let i = 0; i < 5; i++) {
        const routeId = await createTestRoute(client, gymId, i);
        await insertAscent(client, userId, routeId, 'attempt', mondayOfWeek(1));
      }

      const result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'First Send'`,
        [userId]
      );
      // No "First Send" because attempts don't count
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: End-to-end streak badges with seeded data
// ===========================================================================

/**
 * Streak badges reward consistency — climbing every week for N consecutive
 * weeks. The check_and_award_badges function reads current_streak from
 * user_streaks (which was just updated by recompute_streak) and compares
 * against the badge's criteria_value.
 */
describe('End-to-end: streak badges with seeded data', () => {
  it('4 consecutive weeks of ascents awards "Weekly Warrior"', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'e2e-warrior@test.com');
      const gymId = await createTestGym(client, 'E2E Streak Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Insert ascents in 4 consecutive weeks — builds a 4-week streak
      // which matches "Weekly Warrior" (criteria_value = 4)
      for (let week = 1; week <= 4; week++) {
        await insertAscent(client, userId, routeId, 'send', mondayOfWeek(week));
      }

      const result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'Weekly Warrior'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('3 consecutive weeks does NOT award "Weekly Warrior"', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'e2e-short-streak@test.com');
      const gymId = await createTestGym(client, 'E2E Streak Gym 2');
      const routeId = await createTestRoute(client, gymId, 10);

      // Only 3 weeks — one short of the "Weekly Warrior" threshold of 4
      for (let week = 1; week <= 3; week++) {
        await insertAscent(client, userId, routeId, 'send', mondayOfWeek(week));
      }

      const result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'Weekly Warrior'`,
        [userId]
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('streak badge persists after streak breaks (badges are permanent)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'e2e-persist@test.com');
      const gymId = await createTestGym(client, 'E2E Streak Gym 3');
      const routeId = await createTestRoute(client, gymId, 10);

      // Build a 4-week streak to earn "Weekly Warrior"
      for (let week = 1; week <= 4; week++) {
        await insertAscent(client, userId, routeId, 'send', mondayOfWeek(week));
      }

      // Verify badge was earned
      let result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'Weekly Warrior'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);

      // Now break the streak with a 3+ week gap (weeks 4 → 8).
      // The on_ascent_delete trigger doesn't revoke badges, and neither
      // does inserting new ascents after a break. Once earned, always earned.
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(8));

      // Verify the streak is now broken (current_streak should be 1)
      const streakResult = await client.query(
        `SELECT current_streak FROM user_streaks
         WHERE user_id = $1 AND streak_type = 'weekly'`,
        [userId]
      );
      expect(streakResult.rows[0].current_streak).toBe(1);

      // But the badge is still there — permanent!
      result = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.name = 'Weekly Warrior'`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Gamification state reads via RLS
// ===========================================================================

/**
 * RLS policies on gamification tables allow SELECT for authenticated users.
 * These tests verify that an authenticated user can read:
 *   - Badge definitions (badges table)
 *   - Their own streaks and earned badges
 *
 * The pattern is:
 *   1. Create data as superuser (inside transaction)
 *   2. Switch to authenticated role (simulating PostgREST)
 *   3. Verify SELECT works through RLS
 *   4. Reset to superuser for cleanup
 */
describe('Gamification state reads via RLS', () => {
  it('authenticated user can SELECT from badges table', async () => {
    await client.query('BEGIN');
    try {
      // Create a user so we have a valid auth.uid() to set
      const userId = await createTestUser(client, 'rls-badges@test.com');

      // Switch to authenticated role — RLS now applies
      await setAuthenticatedUser(client, userId);

      // Read badge definitions — should see all 18 seeded badges
      const result = await client.query(
        `SELECT count(*) AS cnt FROM badges`
      );
      expect(Number(result.rows[0].cnt)).toBe(18);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('authenticated user can SELECT their own streaks and badges', async () => {
    await client.query('BEGIN');
    try {
      // Create user and trigger some gamification data
      const userId = await createTestUser(client, 'rls-own-data@test.com');
      const gymId = await createTestGym(client, 'RLS Gym');
      const routeId = await createTestRoute(client, gymId, 0); // V0

      // Insert an ascent — triggers streak update and badge award ("First V0", "First Send")
      await insertAscent(client, userId, routeId, 'send', mondayOfWeek(1));

      // Switch to authenticated user — RLS now applies
      await setAuthenticatedUser(client, userId);

      // Verify we can read our own streak data through RLS
      const streakResult = await client.query(
        `SELECT current_streak FROM user_streaks WHERE user_id = $1`,
        [userId]
      );
      expect(streakResult.rows).toHaveLength(1);
      expect(streakResult.rows[0].current_streak).toBe(1);

      // Verify we can read our own earned badges through RLS
      const badgeResult = await client.query(
        `SELECT b.name FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1
         ORDER BY b.name`,
        [userId]
      );
      // Should have at least "First Send" and "First V0"
      const badgeNames = badgeResult.rows.map((r: { name: string }) => r.name);
      expect(badgeNames).toContain('First V0');
      expect(badgeNames).toContain('First Send');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
