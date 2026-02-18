/**
 * Integration tests for profile RPCs (Step 16.1).
 *
 * Three RPCs under test:
 *   1. get_profile_stats(p_user_id)  — total sends + max grade
 *   2. export_user_data()            — JSONB aggregate of user data
 *   3. delete_own_account()          — deletes auth.users row via CASCADE
 *
 * WHY INTEGRATION TESTS?
 * These RPCs rely on joins, aggregation, SECURITY DEFINER, and CASCADE
 * behavior that can't be verified with mocks. Real Postgres is the only
 * way to confirm they work correctly.
 *
 * Prerequisites:
 * - Local Supabase running: `npx supabase start`
 * - All migrations applied: `npx supabase db reset`
 */

import { Client } from 'pg';

const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

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

/** Creates a gym and returns its id. */
async function createTestGym(txClient: Client, name: string): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO gyms (name, default_grade_system) VALUES ($1, 'v-scale') RETURNING id`,
    [name]
  );
  return result.rows[0].id;
}

/** Creates a route at a gym. Returns the route id. */
async function createTestRoute(
  txClient: Client,
  gymId: string,
  name: string,
  canonicalGrade: number
): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO routes (gym_id, name, canonical_grade, status, color, wall_section)
     VALUES ($1, $2, $3, 'active', 'red', 'North')
     RETURNING id`,
    [gymId, name, canonicalGrade]
  );
  return result.rows[0].id;
}

/**
 * Logs an ascent for a user on a route with a given status.
 * Defaults to 'send' — the most common status for stats counting.
 */
async function logAscent(
  txClient: Client,
  userId: string,
  routeId: string,
  status = 'send'
): Promise<void> {
  await txClient.query(
    `INSERT INTO route_ascents (user_id, route_id, status)
     VALUES ($1, $2, $3)`,
    [userId, routeId, status]
  );
}

/** Sets the Supabase auth context so RLS evaluates as a specific user. */
async function setAuthUser(txClient: Client, userId: string): Promise<void> {
  await txClient.query(`SET LOCAL role = 'authenticated'`);
  await txClient.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: userId })}'`);
}

// ===========================================================================
// get_profile_stats
// ===========================================================================

describe('get_profile_stats', () => {
  it('returns 0 sends and null max_grade for a new user', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'newuser@stats.test');

      const result = await client.query(
        `SELECT * FROM get_profile_stats($1)`,
        [userId]
      );

      // New user has no ascents — 0 sends and NULL max grade
      expect(result.rows.length).toBe(1);
      expect(Number(result.rows[0].total_sends)).toBe(0);
      expect(result.rows[0].max_grade).toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('counts sends and flashes toward total_sends', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'sender@stats.test');
      const gymId = await createTestGym(client, 'StatsGym');
      const route1 = await createTestRoute(client, gymId, 'Route A', 10);
      const route2 = await createTestRoute(client, gymId, 'Route B', 15);

      // Log a send and a flash — both should count
      await logAscent(client, userId, route1, 'send');
      await logAscent(client, userId, route2, 'flash');

      const result = await client.query(
        `SELECT * FROM get_profile_stats($1)`,
        [userId]
      );

      expect(Number(result.rows[0].total_sends)).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('excludes attempts from total_sends', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'attempter@stats.test');
      const gymId = await createTestGym(client, 'AttemptGym');
      const route = await createTestRoute(client, gymId, 'Hard Route', 20);

      // Log an attempt — should NOT count toward sends
      await logAscent(client, userId, route, 'attempt');

      const result = await client.query(
        `SELECT * FROM get_profile_stats($1)`,
        [userId]
      );

      expect(Number(result.rows[0].total_sends)).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('returns the correct max_grade across multiple routes', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'maxgrade@stats.test');
      const gymId = await createTestGym(client, 'GradeGym');
      const easyRoute = await createTestRoute(client, gymId, 'Easy', 5);
      const hardRoute = await createTestRoute(client, gymId, 'Hard', 20);

      // Send both routes — max_grade should be 20 (the harder one)
      await logAscent(client, userId, easyRoute, 'send');
      await logAscent(client, userId, hardRoute, 'flash');

      const result = await client.query(
        `SELECT * FROM get_profile_stats($1)`,
        [userId]
      );

      expect(result.rows[0].max_grade).toBe(20);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// export_user_data
// ===========================================================================

describe('export_user_data', () => {
  it('returns profile data for the authenticated user', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'export@test.com');
      await setAuthUser(client, userId);

      const result = await client.query(`SELECT export_user_data()`);
      const data = result.rows[0].export_user_data;

      // The profile object should contain the user's ID
      expect(data.profile).not.toBeNull();
      expect(data.profile.id).toBe(userId);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('returns ascents array (empty for new user)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'exportempty@test.com');
      await setAuthUser(client, userId);

      const result = await client.query(`SELECT export_user_data()`);
      const data = result.rows[0].export_user_data;

      // New user has no ascents — should be an empty array, not null
      expect(data.ascents).toEqual([]);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('includes ascents in the export when user has logged climbs', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'exportascents@test.com');
      const gymId = await createTestGym(client, 'ExportGym');
      const routeId = await createTestRoute(client, gymId, 'Export Route', 10);

      await logAscent(client, userId, routeId, 'send');

      // Set auth context so export_user_data() reads for this user
      await setAuthUser(client, userId);

      const result = await client.query(`SELECT export_user_data()`);
      const data = result.rows[0].export_user_data;

      expect(data.ascents.length).toBe(1);
      expect(data.ascents[0].route_id).toBe(routeId);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('scopes export to the authenticated user only', async () => {
    await client.query('BEGIN');
    try {
      // Create two users, each with ascents
      const user1 = await createTestUser(client, 'export1@test.com');
      const user2 = await createTestUser(client, 'export2@test.com');
      const gymId = await createTestGym(client, 'ScopeGym');
      const route = await createTestRoute(client, gymId, 'Shared Route', 10);

      await logAscent(client, user1, route, 'send');
      await logAscent(client, user2, route, 'flash');

      // Authenticate as user1 — should only see user1's data
      await setAuthUser(client, user1);

      const result = await client.query(`SELECT export_user_data()`);
      const data = result.rows[0].export_user_data;

      expect(data.ascents.length).toBe(1);
      expect(data.ascents[0].user_id).toBe(user1);
      expect(data.profile.id).toBe(user1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// delete_own_account
// ===========================================================================

describe('delete_own_account', () => {
  it('removes the user from auth.users', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'deleteme@test.com');

      // Verify user exists first
      const before = await client.query(
        `SELECT id FROM auth.users WHERE id = $1`,
        [userId]
      );
      expect(before.rows.length).toBe(1);

      // Authenticate as the user, then delete
      await setAuthUser(client, userId);
      await client.query(`SELECT delete_own_account()`);

      // Reset to superuser to verify deletion (the user's role no longer exists)
      await client.query(`RESET role`);

      const after = await client.query(
        `SELECT id FROM auth.users WHERE id = $1`,
        [userId]
      );
      expect(after.rows.length).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('cascades to delete profile and ascents', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'cascade@test.com');
      const gymId = await createTestGym(client, 'CascadeGym');
      const routeId = await createTestRoute(client, gymId, 'Cascade Route', 10);
      await logAscent(client, userId, routeId, 'send');

      // Verify profile and ascent exist
      const profileBefore = await client.query(
        `SELECT id FROM profiles WHERE id = $1`,
        [userId]
      );
      expect(profileBefore.rows.length).toBe(1);

      const ascentsBefore = await client.query(
        `SELECT id FROM route_ascents WHERE user_id = $1`,
        [userId]
      );
      expect(ascentsBefore.rows.length).toBe(1);

      // Delete the account
      await setAuthUser(client, userId);
      await client.query(`SELECT delete_own_account()`);
      await client.query(`RESET role`);

      // Profile and ascents should be gone via CASCADE
      const profileAfter = await client.query(
        `SELECT id FROM profiles WHERE id = $1`,
        [userId]
      );
      expect(profileAfter.rows.length).toBe(0);

      const ascentsAfter = await client.query(
        `SELECT id FROM route_ascents WHERE user_id = $1`,
        [userId]
      );
      expect(ascentsAfter.rows.length).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
