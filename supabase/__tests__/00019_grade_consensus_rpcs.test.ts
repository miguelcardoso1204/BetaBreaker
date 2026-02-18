/**
 * Integration tests for grade consensus RPCs (Step 15.4).
 *
 * Two RPCs under test:
 *   1. get_routes_grade_consensus(p_gym_id) — routes + consensus data for a gym
 *   2. get_grade_submissions(p_route_id) — perceived_grade distribution for a route
 *
 * WHY INTEGRATION TESTS?
 * These RPCs use GROUP BY, LEFT JOIN, and computed columns (divergence).
 * Mocking can't verify that the SQL logic is correct — we need real Postgres.
 *
 * Test data strategy:
 *   - 5+ ascents with perceived_grade on one route → triggers consensus via
 *     check_grade_consensus() (fires automatically from on_ascent_insert trigger)
 *   - Fewer ascents on another route → no consensus, divergence NULL
 *   - An archived route → should be excluded from results
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

/** Assigns a role to a user at a gym. */
async function assignRole(
  txClient: Client,
  userId: string,
  gymId: string,
  role: string
): Promise<void> {
  await txClient.query(
    `INSERT INTO user_gym_roles (user_id, gym_id, role) VALUES ($1, $2, $3)`,
    [userId, gymId, role]
  );
}

/** Sets the Supabase auth context so RLS evaluates as a specific user. */
async function setAuthUser(txClient: Client, userId: string): Promise<void> {
  await txClient.query(`SET LOCAL role = 'authenticated'`);
  await txClient.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: userId })}'`);
}

/** Resets to superuser role. */
async function resetToSuperuser(txClient: Client): Promise<void> {
  await txClient.query(`RESET role`);
}

/**
 * Creates a route at a gym. Returns the route id.
 * Status defaults to 'active'.
 */
async function createTestRoute(
  txClient: Client,
  gymId: string,
  name: string,
  canonicalGrade: number,
  status = 'active'
): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO routes (gym_id, name, canonical_grade, status, color, wall_section)
     VALUES ($1, $2, $3, $4, 'red', 'North')
     RETURNING id`,
    [gymId, name, canonicalGrade, status]
  );
  return result.rows[0].id;
}

/**
 * Logs an ascent with an optional perceived_grade.
 * The on_ascent_insert trigger fires check_grade_consensus() automatically.
 */
async function logAscent(
  txClient: Client,
  userId: string,
  routeId: string,
  perceivedGrade: number | null
): Promise<void> {
  await txClient.query(
    `INSERT INTO route_ascents (user_id, route_id, status, perceived_grade)
     VALUES ($1, $2, 'send', $3)`,
    [userId, routeId, perceivedGrade]
  );
}

// ===========================================================================
// get_routes_grade_consensus
// ===========================================================================

describe('get_routes_grade_consensus', () => {
  it('returns routes with consensus data when ≥5 submissions', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'ConsensusGym');

      // Route at canonical V5 (grade 14)
      const routeId = await createTestRoute(client, gymId, 'Boulder Alpha', 14);

      // Create 5 users who each submit a perceived grade
      // Grades: 12, 13, 14, 15, 16 → median = 14
      for (let i = 0; i < 5; i++) {
        const uid = await createTestUser(client, `consensus${i}@test.com`);
        await logAscent(client, uid, routeId, 12 + i);
      }

      const result = await client.query(
        `SELECT * FROM get_routes_grade_consensus($1)`,
        [gymId]
      );

      expect(result.rows.length).toBe(1);
      const row = result.rows[0];
      expect(row.route_id).toBe(routeId);
      expect(row.name).toBe('Boulder Alpha');
      expect(row.canonical_grade).toBe(14);
      // Median of [12,13,14,15,16] = 14
      expect(row.consensus_grade).toBe(14);
      expect(Number(row.submission_count)).toBe(5);
      // divergence = |14 - 14| = 0
      expect(row.divergence).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('returns NULL consensus_grade and divergence when <5 submissions', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'FewVotesGym');
      const routeId = await createTestRoute(client, gymId, 'Boulder Beta', 10);

      // Only 3 submissions — below the threshold of 5
      for (let i = 0; i < 3; i++) {
        const uid = await createTestUser(client, `fewvotes${i}@test.com`);
        await logAscent(client, uid, routeId, 8 + i);
      }

      const result = await client.query(
        `SELECT * FROM get_routes_grade_consensus($1)`,
        [gymId]
      );

      expect(result.rows.length).toBe(1);
      const row = result.rows[0];
      expect(row.consensus_grade).toBeNull();
      expect(row.divergence).toBeNull();
      // submission_count should still reflect the 3 votes
      expect(Number(row.submission_count)).toBe(3);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('computes divergence as ABS(canonical - consensus)', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'DivergenceGym');
      // Setter says V3 (grade 10), community thinks V6 (grade 17)
      const routeId = await createTestRoute(client, gymId, 'Hard One', 10);

      // 5 submissions all at grade 17 → median = 17
      for (let i = 0; i < 5; i++) {
        const uid = await createTestUser(client, `diverge${i}@test.com`);
        await logAscent(client, uid, routeId, 17);
      }

      const result = await client.query(
        `SELECT * FROM get_routes_grade_consensus($1)`,
        [gymId]
      );

      const row = result.rows[0];
      expect(row.consensus_grade).toBe(17);
      // divergence = |10 - 17| = 7
      expect(row.divergence).toBe(7);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('excludes archived routes', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'ArchivedGym');
      // One active route, one archived
      await createTestRoute(client, gymId, 'Active Route', 10, 'active');
      await createTestRoute(client, gymId, 'Old Route', 15, 'archived');

      const result = await client.query(
        `SELECT * FROM get_routes_grade_consensus($1)`,
        [gymId]
      );

      // Only the active route should appear
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe('Active Route');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('includes retiring_soon routes', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'RetiringGym');
      await createTestRoute(client, gymId, 'Still Here', 10, 'retiring_soon');

      const result = await client.query(
        `SELECT * FROM get_routes_grade_consensus($1)`,
        [gymId]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe('retiring_soon');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('returns 0 rows for a gym with no routes', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'EmptyGym');

      const result = await client.query(
        `SELECT * FROM get_routes_grade_consensus($1)`,
        [gymId]
      );

      expect(result.rows.length).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('excludes routes from other gyms', async () => {
    await client.query('BEGIN');
    try {
      const gym1 = await createTestGym(client, 'MyGym');
      const gym2 = await createTestGym(client, 'OtherGym');
      await createTestRoute(client, gym1, 'My Route', 10);
      await createTestRoute(client, gym2, 'Their Route', 15);

      const result = await client.query(
        `SELECT * FROM get_routes_grade_consensus($1)`,
        [gym1]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe('My Route');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('orders by divergence DESC NULLS LAST then name ASC', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'OrderGym');

      // Route A: no consensus (divergence NULL) — should be last
      await createTestRoute(client, gymId, 'A-NoConsensus', 10);

      // Route B: divergence 3 (canonical 10, consensus 13)
      const routeB = await createTestRoute(client, gymId, 'B-BigDivergence', 10);
      for (let i = 0; i < 5; i++) {
        const uid = await createTestUser(client, `orderB${i}@test.com`);
        await logAscent(client, uid, routeB, 13);
      }

      // Route C: divergence 0 (canonical 10, consensus 10)
      const routeC = await createTestRoute(client, gymId, 'C-NoDivergence', 10);
      for (let i = 0; i < 5; i++) {
        const uid = await createTestUser(client, `orderC${i}@test.com`);
        await logAscent(client, uid, routeC, 10);
      }

      const result = await client.query(
        `SELECT * FROM get_routes_grade_consensus($1)`,
        [gymId]
      );

      expect(result.rows.length).toBe(3);
      // B (divergence 3) first, then C (divergence 0), then A (NULL)
      expect(result.rows[0].name).toBe('B-BigDivergence');
      expect(result.rows[0].divergence).toBe(3);
      expect(result.rows[1].name).toBe('C-NoDivergence');
      expect(result.rows[1].divergence).toBe(0);
      expect(result.rows[2].name).toBe('A-NoConsensus');
      expect(result.rows[2].divergence).toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('is callable by authenticated users via RLS', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'RLSGym');
      await createTestRoute(client, gymId, 'Test Route', 10);

      const userId = await createTestUser(client, 'rlsuser@test.com');
      await setAuthUser(client, userId);

      // Should succeed — routes and route_ascents have SELECT USING (true)
      const result = await client.query(
        `SELECT * FROM get_routes_grade_consensus($1)`,
        [gymId]
      );

      expect(result.rows.length).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// get_grade_submissions
// ===========================================================================

describe('get_grade_submissions', () => {
  it('returns grade distribution with correct counts', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'DistGym');
      const routeId = await createTestRoute(client, gymId, 'Dist Route', 14);

      // 3 users vote grade 14, 2 users vote grade 16
      for (let i = 0; i < 3; i++) {
        const uid = await createTestUser(client, `dist14_${i}@test.com`);
        await logAscent(client, uid, routeId, 14);
      }
      for (let i = 0; i < 2; i++) {
        const uid = await createTestUser(client, `dist16_${i}@test.com`);
        await logAscent(client, uid, routeId, 16);
      }

      const result = await client.query(
        `SELECT * FROM get_grade_submissions($1)`,
        [routeId]
      );

      expect(result.rows.length).toBe(2);
      // Ordered by perceived_grade ASC
      expect(result.rows[0].perceived_grade).toBe(14);
      expect(Number(result.rows[0].submission_count)).toBe(3);
      expect(result.rows[1].perceived_grade).toBe(16);
      expect(Number(result.rows[1].submission_count)).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('excludes ascents with NULL perceived_grade', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'NullGym');
      const routeId = await createTestRoute(client, gymId, 'Null Route', 10);

      const u1 = await createTestUser(client, 'nullgrade1@test.com');
      const u2 = await createTestUser(client, 'nullgrade2@test.com');

      // One with grade, one without (NULL = "no opinion")
      await logAscent(client, u1, routeId, 12);
      await logAscent(client, u2, routeId, null);

      const result = await client.query(
        `SELECT * FROM get_grade_submissions($1)`,
        [routeId]
      );

      // Only the non-null submission appears
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].perceived_grade).toBe(12);
      expect(Number(result.rows[0].submission_count)).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('returns 0 rows for a route with no submissions', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'NoSubGym');
      const routeId = await createTestRoute(client, gymId, 'No Sub Route', 10);

      const result = await client.query(
        `SELECT * FROM get_grade_submissions($1)`,
        [routeId]
      );

      expect(result.rows.length).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
