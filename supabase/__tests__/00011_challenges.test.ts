/**
 * Integration tests for challenges & quests tables (Step 8.4).
 *
 * These tests verify:
 *   - 2 new tables: challenges, user_challenge_progress
 *   - RLS enabled on both tables
 *   - CHECK constraints (end_date > start_date, progress >= 0)
 *   - NOT NULL constraints (criteria NOT NULL)
 *   - CASCADE/SET NULL foreign key behavior
 *   - RLS policies (gym_admin CRUD on challenges, SELECT-only on progress)
 *   - Trigger-based progress tracking (4 criteria types + completion + badge award)
 *   - Badge CHECK expansion (allows 'challenge' criteria_type)
 *   - Seed data still correct after migration
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - All migrations applied: `npx supabase db reset`
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
// Test Helpers (same patterns as previous integration test files)
// ===========================================================================

/**
 * Creates a test user in auth.users. The handle_new_user trigger
 * automatically creates a corresponding profile row.
 */
async function createTestUser(txClient: Client, email: string): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated', $1,
      crypt('password123', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', ''
    ) RETURNING id`,
    [email]
  );
  return result.rows[0].id;
}

/**
 * Switches the Postgres session to act as an authenticated user.
 * Simulates PostgREST's behavior when a valid JWT is present.
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
 * Assigns a gym role to a user (e.g., 'gym_admin', 'setter', 'climber').
 */
async function assignGymRole(
  txClient: Client,
  userId: string,
  gymId: string,
  role: string,
): Promise<void> {
  await txClient.query(
    `INSERT INTO user_gym_roles (user_id, gym_id, role)
     VALUES ($1, $2, $3)`,
    [userId, gymId, role]
  );
}

/**
 * Creates a challenge for a gym. Returns the challenge's UUID.
 */
async function createTestChallenge(
  txClient: Client,
  gymId: string,
  opts: {
    name?: string;
    criteria?: object;
    startDate?: string;
    endDate?: string;
    rewardBadgeId?: string | null;
    createdBy?: string | null;
  } = {},
): Promise<string> {
  const {
    name = 'Test Challenge',
    criteria = { type: 'send_count', target: 5 },
    startDate = '2020-01-01T00:00:00Z',
    endDate = '2099-12-31T23:59:59Z',
    rewardBadgeId = null,
    createdBy = null,
  } = opts;

  const result = await txClient.query(
    `INSERT INTO challenges (gym_id, name, criteria, start_date, end_date, reward_badge_id, created_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7) RETURNING id`,
    [gymId, name, JSON.stringify(criteria), startDate, endDate, rewardBadgeId, createdBy]
  );
  return result.rows[0].id;
}

/**
 * Inserts an ascent (which fires the on_ascent_insert trigger chain).
 */
async function createTestAscent(
  txClient: Client,
  userId: string,
  routeId: string,
  status: string,
): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO route_ascents (user_id, route_id, status)
     VALUES ($1, $2, $3) RETURNING id`,
    [userId, routeId, status]
  );
  return result.rows[0].id;
}


// ===========================================================================
// Test Suite: Tables exist
// ===========================================================================

describe('Challenge tables exist', () => {
  it('challenges table exists in public schema', async () => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'challenges'`
    );
    expect(result.rows).toHaveLength(1);
  });

  it('user_challenge_progress table exists in public schema', async () => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'user_challenge_progress'`
    );
    expect(result.rows).toHaveLength(1);
  });
});


// ===========================================================================
// Test Suite: RLS enabled
// ===========================================================================

describe('RLS enabled on challenge tables', () => {
  it('RLS is enabled on challenges', async () => {
    const result = await client.query(
      `SELECT relrowsecurity FROM pg_class
       WHERE relname = 'challenges' AND relnamespace = 'public'::regnamespace`
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].relrowsecurity).toBe(true);
  });

  it('RLS is enabled on user_challenge_progress', async () => {
    const result = await client.query(
      `SELECT relrowsecurity FROM pg_class
       WHERE relname = 'user_challenge_progress' AND relnamespace = 'public'::regnamespace`
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].relrowsecurity).toBe(true);
  });
});


// ===========================================================================
// Test Suite: CHECK constraints
// ===========================================================================

describe('CHECK constraints', () => {
  it('end_date must be greater than start_date', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Check Dates Gym');
      // end_date is BEFORE start_date — should fail the CHECK constraint
      await expect(
        client.query(
          `INSERT INTO challenges (gym_id, name, criteria, start_date, end_date)
           VALUES ($1, 'Bad Dates', '{"type":"send_count","target":5}'::jsonb,
                   '2026-02-15T00:00:00Z', '2026-02-01T00:00:00Z')`,
          [gymId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('progress must be >= 0', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'check-progress@test.com');
      const gymId = await createTestGym(client, 'Check Progress Gym');
      const challengeId = await createTestChallenge(client, gymId);

      // Negative progress should fail the CHECK constraint
      await expect(
        client.query(
          `INSERT INTO user_challenge_progress (user_id, challenge_id, progress)
           VALUES ($1, $2, -1)`,
          [userId, challengeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});


// ===========================================================================
// Test Suite: NOT NULL constraints
// ===========================================================================

describe('NOT NULL constraints', () => {
  it('criteria cannot be NULL', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Null Criteria Gym');
      await expect(
        client.query(
          `INSERT INTO challenges (gym_id, name, criteria, start_date, end_date)
           VALUES ($1, 'No Criteria', NULL, '2026-02-01T00:00:00Z', '2026-02-15T00:00:00Z')`,
          [gymId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});


// ===========================================================================
// Test Suite: CASCADE / SET NULL behavior
// ===========================================================================

describe('CASCADE and SET NULL behavior', () => {
  it('deleting gym cascades to challenges', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Cascade Gym');
      const challengeId = await createTestChallenge(client, gymId);

      // Delete the gym — should cascade to challenges
      await client.query('DELETE FROM gyms WHERE id = $1', [gymId]);

      const result = await client.query(
        'SELECT id FROM challenges WHERE id = $1',
        [challengeId]
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('deleting challenge cascades to user_challenge_progress', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'cascade-progress@test.com');
      const gymId = await createTestGym(client, 'Cascade Challenge Gym');
      const challengeId = await createTestChallenge(client, gymId);

      // Insert progress row directly
      await client.query(
        `INSERT INTO user_challenge_progress (user_id, challenge_id, progress)
         VALUES ($1, $2, 3)`,
        [userId, challengeId]
      );

      // Delete the challenge — should cascade to progress
      await client.query('DELETE FROM challenges WHERE id = $1', [challengeId]);

      const result = await client.query(
        'SELECT * FROM user_challenge_progress WHERE challenge_id = $1',
        [challengeId]
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('deleting user cascades to user_challenge_progress', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'cascade-user-progress@test.com');
      const gymId = await createTestGym(client, 'Cascade User Gym');
      const challengeId = await createTestChallenge(client, gymId);

      await client.query(
        `INSERT INTO user_challenge_progress (user_id, challenge_id, progress)
         VALUES ($1, $2, 2)`,
        [userId, challengeId]
      );

      // Delete the user (cascade: auth.users → profiles → user_challenge_progress)
      await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);

      const result = await client.query(
        'SELECT * FROM user_challenge_progress WHERE user_id = $1',
        [userId]
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('deleting creator sets created_by to NULL', async () => {
    await client.query('BEGIN');
    try {
      const creatorId = await createTestUser(client, 'cascade-creator@test.com');
      const gymId = await createTestGym(client, 'Creator SET NULL Gym');

      const challengeId = await createTestChallenge(client, gymId, {
        createdBy: creatorId,
      });

      // Delete the creator's profile — should SET NULL on challenges.created_by
      // (We delete auth.users which cascades to profiles)
      await client.query('DELETE FROM auth.users WHERE id = $1', [creatorId]);

      const result = await client.query(
        'SELECT created_by FROM challenges WHERE id = $1',
        [challengeId]
      );
      expect(result.rows[0].created_by).toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('deleting reward badge sets reward_badge_id to NULL', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Badge SET NULL Gym');

      // Create a challenge-type badge to use as reward
      const badgeResult = await client.query(
        `INSERT INTO badges (name, icon_key, criteria_type, criteria_value)
         VALUES ('Test Challenge Badge 011a', 'badge-challenge', 'challenge', 0)
         RETURNING id`
      );
      const badgeId = badgeResult.rows[0].id;

      const challengeId = await createTestChallenge(client, gymId, {
        rewardBadgeId: badgeId,
      });

      // Delete the badge — should SET NULL on challenges.reward_badge_id
      await client.query('DELETE FROM badges WHERE id = $1', [badgeId]);

      const result = await client.query(
        'SELECT reward_badge_id FROM challenges WHERE id = $1',
        [challengeId]
      );
      expect(result.rows[0].reward_badge_id).toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});


// ===========================================================================
// Test Suite: RLS policies — challenges
// ===========================================================================

describe('RLS policies — challenges', () => {
  it('authenticated user can SELECT challenges', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'select-challenges@test.com');
      const gymId = await createTestGym(client, 'RLS Select Gym');
      await createTestChallenge(client, gymId, { name: 'Visible Challenge' });

      // Switch to authenticated user
      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `SELECT name FROM challenges WHERE name = 'Visible Challenge'`
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can INSERT challenges', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'admin-insert-challenge@test.com');
      const gymId = await createTestGym(client, 'RLS Insert Gym');
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to gym admin
      await setAuthenticatedUser(client, adminId);

      const result = await client.query(
        `INSERT INTO challenges (gym_id, name, criteria, start_date, end_date)
         VALUES ($1, 'Admin Challenge', '{"type":"send_count","target":10}'::jsonb,
                 '2026-02-01T00:00:00Z', '2026-02-28T23:59:59Z')
         RETURNING id`,
        [gymId]
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('climber cannot INSERT challenges', async () => {
    await client.query('BEGIN');
    try {
      const climberId = await createTestUser(client, 'climber-insert-challenge@test.com');
      const gymId = await createTestGym(client, 'RLS Climber Insert Gym');
      // No gym role assigned — defaults to climber level (no role = rank 0)

      await setAuthenticatedUser(client, climberId);

      await expect(
        client.query(
          `INSERT INTO challenges (gym_id, name, criteria, start_date, end_date)
           VALUES ($1, 'Climber Challenge', '{"type":"send_count","target":5}'::jsonb,
                   '2026-02-01T00:00:00Z', '2026-02-28T23:59:59Z')`,
          [gymId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can UPDATE challenges', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'admin-update-challenge@test.com');
      const gymId = await createTestGym(client, 'RLS Update Gym');
      await assignGymRole(client, adminId, gymId, 'gym_admin');
      const challengeId = await createTestChallenge(client, gymId, {
        name: 'Before Update',
      });

      await setAuthenticatedUser(client, adminId);

      await client.query(
        `UPDATE challenges SET name = 'After Update' WHERE id = $1`,
        [challengeId]
      );

      await resetToSuperuser(client);

      const result = await client.query(
        'SELECT name FROM challenges WHERE id = $1',
        [challengeId]
      );
      expect(result.rows[0].name).toBe('After Update');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can DELETE challenges', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'admin-delete-challenge@test.com');
      const gymId = await createTestGym(client, 'RLS Delete Gym');
      await assignGymRole(client, adminId, gymId, 'gym_admin');
      const challengeId = await createTestChallenge(client, gymId);

      await setAuthenticatedUser(client, adminId);

      await client.query('DELETE FROM challenges WHERE id = $1', [challengeId]);

      await resetToSuperuser(client);

      const result = await client.query(
        'SELECT id FROM challenges WHERE id = $1',
        [challengeId]
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});


// ===========================================================================
// Test Suite: RLS policies — user_challenge_progress
// ===========================================================================

describe('RLS policies — user_challenge_progress', () => {
  it('authenticated user can SELECT progress', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'select-progress@test.com');
      const gymId = await createTestGym(client, 'RLS Progress Select Gym');
      const challengeId = await createTestChallenge(client, gymId);

      // Insert progress as superuser (simulating trigger)
      await client.query(
        `INSERT INTO user_challenge_progress (user_id, challenge_id, progress)
         VALUES ($1, $2, 3)`,
        [userId, challengeId]
      );

      // Switch to authenticated user
      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `SELECT progress FROM user_challenge_progress WHERE challenge_id = $1`,
        [challengeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].progress).toBe(3);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('authenticated user cannot INSERT progress directly', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'insert-progress@test.com');
      const gymId = await createTestGym(client, 'RLS Progress Insert Gym');
      const challengeId = await createTestChallenge(client, gymId);

      await setAuthenticatedUser(client, userId);

      // Direct INSERT should be denied — only trigger can write
      await expect(
        client.query(
          `INSERT INTO user_challenge_progress (user_id, challenge_id, progress)
           VALUES ($1, $2, 99)`,
          [userId, challengeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});


// ===========================================================================
// Test Suite: Trigger — progress tracking
// ===========================================================================

describe('Trigger: challenge progress tracking', () => {
  it('send_count: updates progress on ascent insert', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-send-count@test.com');
      const gymId = await createTestGym(client, 'Trigger Send Count Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const challengeId = await createTestChallenge(client, gymId, {
        criteria: { type: 'send_count', target: 5 },
      });

      // Log 2 successful ascents
      await createTestAscent(client, userId, routeId, 'send');
      await createTestAscent(client, userId, routeId, 'flash');

      const result = await client.query(
        `SELECT progress FROM user_challenge_progress
         WHERE user_id = $1 AND challenge_id = $2`,
        [userId, challengeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].progress).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('flash_count: only counts flash ascents', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-flash-count@test.com');
      const gymId = await createTestGym(client, 'Trigger Flash Count Gym');
      const routeId = await createTestRoute(client, gymId, 12);
      const challengeId = await createTestChallenge(client, gymId, {
        criteria: { type: 'flash_count', target: 3 },
      });

      // 1 flash + 2 sends — only the flash counts
      await createTestAscent(client, userId, routeId, 'flash');
      await createTestAscent(client, userId, routeId, 'send');
      await createTestAscent(client, userId, routeId, 'send');

      const result = await client.query(
        `SELECT progress FROM user_challenge_progress
         WHERE user_id = $1 AND challenge_id = $2`,
        [userId, challengeId]
      );
      expect(result.rows[0].progress).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('unique_routes: deduplicates by route_id', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-unique-routes@test.com');
      const gymId = await createTestGym(client, 'Trigger Unique Routes Gym');
      const route1 = await createTestRoute(client, gymId, 8);
      const route2 = await createTestRoute(client, gymId, 10);
      const challengeId = await createTestChallenge(client, gymId, {
        criteria: { type: 'unique_routes', target: 5 },
      });

      // 3 ascents on 2 unique routes
      await createTestAscent(client, userId, route1, 'send');
      await createTestAscent(client, userId, route1, 'flash');
      await createTestAscent(client, userId, route2, 'send');

      const result = await client.query(
        `SELECT progress FROM user_challenge_progress
         WHERE user_id = $1 AND challenge_id = $2`,
        [userId, challengeId]
      );
      expect(result.rows[0].progress).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('grade_sends: filters by min_grade', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-grade-sends@test.com');
      const gymId = await createTestGym(client, 'Trigger Grade Sends Gym');
      const routeEasy = await createTestRoute(client, gymId, 8);   // Below min_grade
      const routeHard = await createTestRoute(client, gymId, 14);  // At min_grade
      const routeHarder = await createTestRoute(client, gymId, 18); // Above min_grade
      const challengeId = await createTestChallenge(client, gymId, {
        criteria: { type: 'grade_sends', target: 5, min_grade: 14 },
      });

      // 1 below + 1 at + 1 above min_grade → 2 qualifying sends
      await createTestAscent(client, userId, routeEasy, 'send');
      await createTestAscent(client, userId, routeHard, 'send');
      await createTestAscent(client, userId, routeHarder, 'flash');

      const result = await client.query(
        `SELECT progress FROM user_challenge_progress
         WHERE user_id = $1 AND challenge_id = $2`,
        [userId, challengeId]
      );
      expect(result.rows[0].progress).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('sets completed_at when target is reached', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-completion@test.com');
      const gymId = await createTestGym(client, 'Trigger Completion Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const challengeId = await createTestChallenge(client, gymId, {
        criteria: { type: 'send_count', target: 2 },
      });

      // Log exactly target number of ascents
      await createTestAscent(client, userId, routeId, 'send');
      await createTestAscent(client, userId, routeId, 'send');

      const result = await client.query(
        `SELECT progress, completed_at FROM user_challenge_progress
         WHERE user_id = $1 AND challenge_id = $2`,
        [userId, challengeId]
      );
      expect(result.rows[0].progress).toBe(2);
      expect(result.rows[0].completed_at).not.toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('awards reward badge on completion', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-badge-award@test.com');
      const gymId = await createTestGym(client, 'Trigger Badge Award Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Create a challenge-type badge as the reward
      const badgeResult = await client.query(
        `INSERT INTO badges (name, icon_key, criteria_type, criteria_value)
         VALUES ('Test Reward Badge 011', 'badge-reward', 'challenge', 0)
         RETURNING id`
      );
      const rewardBadgeId = badgeResult.rows[0].id;

      const challengeId = await createTestChallenge(client, gymId, {
        criteria: { type: 'send_count', target: 1 },
        rewardBadgeId,
      });

      // One send should complete the challenge and award the badge
      await createTestAscent(client, userId, routeId, 'send');

      // Check that the reward badge was awarded
      const badgeCheck = await client.query(
        `SELECT * FROM user_badges
         WHERE user_id = $1 AND badge_id = $2`,
        [userId, rewardBadgeId]
      );
      expect(badgeCheck.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('attempts do not count toward send_count progress', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-attempts@test.com');
      const gymId = await createTestGym(client, 'Trigger Attempts Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const challengeId = await createTestChallenge(client, gymId, {
        criteria: { type: 'send_count', target: 5 },
      });

      // Log 1 send and 2 attempts — only send counts
      await createTestAscent(client, userId, routeId, 'send');
      await createTestAscent(client, userId, routeId, 'attempt');
      await createTestAscent(client, userId, routeId, 'attempt');

      const result = await client.query(
        `SELECT progress FROM user_challenge_progress
         WHERE user_id = $1 AND challenge_id = $2`,
        [userId, challengeId]
      );
      expect(result.rows[0].progress).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('expired challenge is not updated by new ascents', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-expired@test.com');
      const gymId = await createTestGym(client, 'Trigger Expired Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Create a challenge that has already ended
      await createTestChallenge(client, gymId, {
        name: 'Expired Challenge',
        criteria: { type: 'send_count', target: 5 },
        startDate: '2020-01-01T00:00:00Z',
        endDate: '2020-02-01T00:00:00Z',  // Ended in 2020
      });

      // Log an ascent — should NOT create progress for expired challenge
      await createTestAscent(client, userId, routeId, 'send');

      const result = await client.query(
        `SELECT * FROM user_challenge_progress
         WHERE user_id = $1`,
        [userId]
      );
      // Should have no progress rows for expired challenge
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('challenge at different gym is unaffected', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-diff-gym@test.com');
      const gym1 = await createTestGym(client, 'Trigger Gym 1');
      const gym2 = await createTestGym(client, 'Trigger Gym 2');
      const routeGym1 = await createTestRoute(client, gym1, 10);

      // Create challenges at both gyms
      const challenge1 = await createTestChallenge(client, gym1, {
        name: 'Gym 1 Challenge',
        criteria: { type: 'send_count', target: 5 },
      });
      const challenge2 = await createTestChallenge(client, gym2, {
        name: 'Gym 2 Challenge',
        criteria: { type: 'send_count', target: 5 },
      });

      // Log ascent at gym 1 — should only update gym 1's challenge
      await createTestAscent(client, userId, routeGym1, 'send');

      // Gym 1 challenge should have progress
      const result1 = await client.query(
        `SELECT progress FROM user_challenge_progress
         WHERE user_id = $1 AND challenge_id = $2`,
        [userId, challenge1]
      );
      expect(result1.rows).toHaveLength(1);
      expect(result1.rows[0].progress).toBe(1);

      // Gym 2 challenge should have NO progress
      const result2 = await client.query(
        `SELECT * FROM user_challenge_progress
         WHERE user_id = $1 AND challenge_id = $2`,
        [userId, challenge2]
      );
      expect(result2.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});


// ===========================================================================
// Test Suite: Badge CHECK constraint expansion
// ===========================================================================

describe('Badge CHECK constraint', () => {
  it('allows challenge criteria_type in badges table', async () => {
    await client.query('BEGIN');
    try {
      // Inserting a badge with criteria_type = 'challenge' should succeed
      const result = await client.query(
        `INSERT INTO badges (name, icon_key, criteria_type, criteria_value)
         VALUES ('Test Challenge Type Badge 011', 'badge-challenge', 'challenge', 0)
         RETURNING id`
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});


// ===========================================================================
// Test Suite: Seed data integrity
// ===========================================================================

describe('Seed data integrity', () => {
  it('badge count includes existing badges (not broken by migration)', async () => {
    // Verify seed badges still exist after the new migration.
    // The exact count depends on how many were seeded, but should be at least
    // the original seed badges. This catches accidental DROP/TRUNCATE issues.
    const result = await client.query(
      `SELECT count(*) as cnt FROM badges`
    );
    // At minimum: seed badges from 20260206003749 + First Flash from 20260210113100
    expect(parseInt(result.rows[0].cnt)).toBeGreaterThanOrEqual(2);
  });
});
