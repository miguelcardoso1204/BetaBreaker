/**
 * Integration tests for gym_billing_records table and billing functions (Step 13.3).
 *
 * These tests verify:
 *   - gym_billing_records: table structure, RLS, UNIQUE, CHECK constraints
 *   - get_gym_active_user_count(): correct counting of distinct active users
 *   - generate_monthly_billing(): invoice generation, idempotency, multi-gym
 *
 * WHY INTEGRATION TESTS?
 * Billing logic lives entirely in Postgres — RLS policies control who can
 * see billing records, and SECURITY DEFINER functions count users and generate
 * invoices. These can't be tested with mocks; we need real SQL execution
 * against the local Supabase Postgres instance.
 *
 * Prerequisites:
 * - Local Supabase running: `npx supabase start`
 * - All migrations applied: `npx supabase db reset`
 */

import { Client } from 'pg';

/**
 * Connection string for the local Supabase Postgres instance.
 * Port 54322 is the default for `supabase start`.
 */
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

/**
 * Creates a test gym. Returns the gym's UUID.
 */
async function createTestGym(txClient: Client, name: string): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO gyms (name, default_grade_system) VALUES ($1, 'v-scale') RETURNING id`,
    [name]
  );
  return result.rows[0].id;
}

/**
 * Creates a test route at a gym. Returns the route's UUID.
 */
async function createTestRoute(txClient: Client, gymId: string, name: string): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO routes (gym_id, name, canonical_grade, status) VALUES ($1, $2, 10, 'active') RETURNING id`,
    [gymId, name]
  );
  return result.rows[0].id;
}

/**
 * Logs an ascent for a user on a route with a specific timestamp.
 */
async function createTestAscent(
  txClient: Client,
  userId: string,
  routeId: string,
  createdAt: string
): Promise<void> {
  await txClient.query(
    `INSERT INTO route_ascents (user_id, route_id, status, created_at)
     VALUES ($1, $2, 'send', $3::timestamptz)`,
    [userId, routeId, createdAt]
  );
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

// ===========================================================================
// gym_billing_records table
// ===========================================================================

describe('gym_billing_records table', () => {

  it('exists with the correct columns', async () => {
    // Verify the migration created the table with all expected columns.
    const result = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'gym_billing_records'
       ORDER BY ordinal_position`
    );

    const columns = result.rows.map((r) => r.column_name);

    expect(columns).toContain('id');
    expect(columns).toContain('gym_id');
    expect(columns).toContain('period_start');
    expect(columns).toContain('period_end');
    expect(columns).toContain('active_user_count');
    expect(columns).toContain('rate_per_user_eur');
    expect(columns).toContain('total_due_eur');
    expect(columns).toContain('status');
    expect(columns).toContain('created_at');
  });

  it('has RLS enabled', async () => {
    // Without RLS, any authenticated user could see all gym billing data.
    const result = await client.query(
      `SELECT relrowsecurity FROM pg_class
       WHERE relname = 'gym_billing_records'`
    );
    expect(result.rows[0].relrowsecurity).toBe(true);
  });

  it('allows gym admin to SELECT their gym billing', async () => {
    // Gym admins need to see their billing records in the admin dashboard.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'billing-admin@test.com');
      const gymId = await createTestGym(client, 'Admin Billing Gym');

      // Grant gym_admin role to this user
      await client.query(
        `INSERT INTO user_gym_roles (user_id, gym_id, role) VALUES ($1, $2, 'gym_admin')`,
        [userId, gymId]
      );

      // Insert a billing record as superuser (simulating cron job)
      await client.query(
        `INSERT INTO gym_billing_records (gym_id, period_start, period_end, active_user_count, total_due_eur)
         VALUES ($1, '2026-01-01', '2026-02-01', 5, 2.50)`,
        [gymId]
      );

      // Switch to authenticated gym admin
      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `SELECT active_user_count, total_due_eur FROM gym_billing_records WHERE gym_id = $1`,
        [gymId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].active_user_count).toBe(5);
      // numeric comes back as string from pg driver
      expect(parseFloat(result.rows[0].total_due_eur)).toBe(2.50);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('blocks gym admin from SELECT on another gym billing', async () => {
    // A gym admin at Gym A must not see Gym B's billing data.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'billing-wrong-gym@test.com');
      const gymA = await createTestGym(client, 'Billing Gym A');
      const gymB = await createTestGym(client, 'Billing Gym B');

      // User is admin of Gym A only
      await client.query(
        `INSERT INTO user_gym_roles (user_id, gym_id, role) VALUES ($1, $2, 'gym_admin')`,
        [userId, gymA]
      );

      // Billing record exists for Gym B
      await client.query(
        `INSERT INTO gym_billing_records (gym_id, period_start, period_end, active_user_count, total_due_eur)
         VALUES ($1, '2026-01-01', '2026-02-01', 10, 5.00)`,
        [gymB]
      );

      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `SELECT * FROM gym_billing_records WHERE gym_id = $1`,
        [gymB]
      );

      // RLS filters out Gym B's records — the admin sees nothing
      expect(result.rows).toHaveLength(0);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('blocks regular climber from SELECT on any billing', async () => {
    // Users without gym_admin or super_admin role should see no billing records.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'billing-climber@test.com');
      const gymId = await createTestGym(client, 'Billing Climber Gym');

      await client.query(
        `INSERT INTO gym_billing_records (gym_id, period_start, period_end, active_user_count, total_due_eur)
         VALUES ($1, '2026-01-01', '2026-02-01', 3, 1.50)`,
        [gymId]
      );

      await setAuthenticatedUser(client, userId);

      const result = await client.query('SELECT * FROM gym_billing_records');

      expect(result.rows).toHaveLength(0);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('blocks authenticated INSERT (no policy)', async () => {
    // Only the billing function (SECURITY DEFINER) should create records.
    // Authenticated users must not be able to forge billing records.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'billing-insert@test.com');
      const gymId = await createTestGym(client, 'Billing Insert Gym');

      await setAuthenticatedUser(client, userId);

      await expect(
        client.query(
          `INSERT INTO gym_billing_records (gym_id, period_start, period_end, active_user_count, total_due_eur)
           VALUES ($1, '2026-01-01', '2026-02-01', 0, 0.00)`,
          [gymId]
        )
      ).rejects.toThrow();

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('enforces UNIQUE(gym_id, period_start)', async () => {
    // Two billing records for the same gym and period should be rejected.
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Billing Unique Gym');

      await client.query(
        `INSERT INTO gym_billing_records (gym_id, period_start, period_end, active_user_count, total_due_eur)
         VALUES ($1, '2026-01-01', '2026-02-01', 5, 2.50)`,
        [gymId]
      );

      await expect(
        client.query(
          `INSERT INTO gym_billing_records (gym_id, period_start, period_end, active_user_count, total_due_eur)
           VALUES ($1, '2026-01-01', '2026-02-01', 10, 5.00)`,
          [gymId]
        )
      ).rejects.toThrow(/unique/i);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('rejects invalid status values', async () => {
    // Only 'pending', 'invoiced', and 'paid' are allowed.
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Billing Bad Status Gym');

      await expect(
        client.query(
          `INSERT INTO gym_billing_records (gym_id, period_start, period_end, active_user_count, total_due_eur, status)
           VALUES ($1, '2026-01-01', '2026-02-01', 1, 0.50, 'cancelled')`,
          [gymId]
        )
      ).rejects.toThrow();

    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// get_gym_active_user_count()
// ===========================================================================

describe('get_gym_active_user_count()', () => {

  it('returns 0 for a gym with no ascents in the period', async () => {
    // A brand-new gym with no climbers should have 0 active users.
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Empty Billing Gym');

      const result = await client.query(
        `SELECT get_gym_active_user_count($1, '2026-01-01', '2026-02-01') AS count`,
        [gymId]
      );

      expect(result.rows[0].count).toBe(0);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('returns correct distinct user count (2 users, 3 ascents = 2)', async () => {
    // If user A logs 2 ascents and user B logs 1 ascent, the count should be 2
    // (distinct users), not 3 (total ascents).
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Active Users Gym');
      const routeId = await createTestRoute(client, gymId, 'Active Route');
      const userA = await createTestUser(client, 'active-a@test.com');
      const userB = await createTestUser(client, 'active-b@test.com');

      // User A logs 2 ascents in January
      await createTestAscent(client, userA, routeId, '2026-01-10T12:00:00Z');
      await createTestAscent(client, userA, routeId, '2026-01-15T12:00:00Z');

      // User B logs 1 ascent in January
      await createTestAscent(client, userB, routeId, '2026-01-20T12:00:00Z');

      const result = await client.query(
        `SELECT get_gym_active_user_count($1, '2026-01-01', '2026-02-01') AS count`,
        [gymId]
      );

      // 2 distinct users, not 3 ascents
      expect(result.rows[0].count).toBe(2);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('excludes ascents outside the date range', async () => {
    // Only ascents within [period_start, period_end) should be counted.
    // Ascents before or after the period are excluded.
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Date Range Gym');
      const routeId = await createTestRoute(client, gymId, 'Date Range Route');
      const userId = await createTestUser(client, 'date-range@test.com');

      // Ascent in December (before the Jan billing period)
      await createTestAscent(client, userId, routeId, '2025-12-15T12:00:00Z');

      // Ascent in February (after the Jan billing period)
      await createTestAscent(client, userId, routeId, '2026-02-05T12:00:00Z');

      const result = await client.query(
        `SELECT get_gym_active_user_count($1, '2026-01-01', '2026-02-01') AS count`,
        [gymId]
      );

      // Neither ascent falls within January, so count is 0
      expect(result.rows[0].count).toBe(0);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('excludes ascents at other gyms', async () => {
    // A user who climbs at Gym B should not count as active at Gym A.
    await client.query('BEGIN');
    try {
      const gymA = await createTestGym(client, 'Gym A Billing');
      const gymB = await createTestGym(client, 'Gym B Billing');
      const routeB = await createTestRoute(client, gymB, 'Route at Gym B');
      const userId = await createTestUser(client, 'other-gym@test.com');

      // User climbs at Gym B, not Gym A
      await createTestAscent(client, userId, routeB, '2026-01-15T12:00:00Z');

      const result = await client.query(
        `SELECT get_gym_active_user_count($1, '2026-01-01', '2026-02-01') AS count`,
        [gymA]
      );

      // Ascent was at Gym B, so Gym A has 0 active users
      expect(result.rows[0].count).toBe(0);

    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// generate_monthly_billing()
// ===========================================================================

describe('generate_monthly_billing()', () => {

  it('generates a billing record for a gym with active users', async () => {
    // The function should insert a record with the correct active_user_count
    // and total_due_eur for gyms that had climbers during the period.
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Generate Billing Gym');
      const routeId = await createTestRoute(client, gymId, 'Generate Billing Route');
      const userId = await createTestUser(client, 'gen-billing@test.com');

      // User logged an ascent in January 2026
      await createTestAscent(client, userId, routeId, '2026-01-15T12:00:00Z');

      // Generate billing for January 2026
      await client.query(`SELECT generate_monthly_billing('2026-01-15'::date)`);

      // Cast date columns to text to avoid the pg driver applying local
      // timezone offsets (e.g., CET shifts midnight dates back by one hour).
      const result = await client.query(
        `SELECT period_start::text, period_end::text, active_user_count, total_due_eur, status
         FROM gym_billing_records WHERE gym_id = $1`,
        [gymId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].period_start).toBe('2026-01-01');
      expect(result.rows[0].period_end).toBe('2026-02-01');
      expect(result.rows[0].active_user_count).toBe(1);
      expect(parseFloat(result.rows[0].total_due_eur)).toBe(0.50);
      expect(result.rows[0].status).toBe('pending');

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('creates a record with count 0 for gyms with no active users (audit trail)', async () => {
    // Even gyms with no activity get a billing record for audit completeness.
    // This makes it easy to confirm the cron ran for all gyms.
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Empty Activity Gym');

      await client.query(`SELECT generate_monthly_billing('2026-01-15'::date)`);

      const result = await client.query(
        `SELECT * FROM gym_billing_records WHERE gym_id = $1`,
        [gymId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].active_user_count).toBe(0);
      expect(parseFloat(result.rows[0].total_due_eur)).toBe(0);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('calculates total_due correctly (3 users × €0.50 = €1.50)', async () => {
    // Verify the arithmetic: total = count × rate
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Calc Billing Gym');
      const routeId = await createTestRoute(client, gymId, 'Calc Route');
      const user1 = await createTestUser(client, 'calc-1@test.com');
      const user2 = await createTestUser(client, 'calc-2@test.com');
      const user3 = await createTestUser(client, 'calc-3@test.com');

      // 3 different users climb in January
      await createTestAscent(client, user1, routeId, '2026-01-05T12:00:00Z');
      await createTestAscent(client, user2, routeId, '2026-01-10T12:00:00Z');
      await createTestAscent(client, user3, routeId, '2026-01-20T12:00:00Z');

      await client.query(`SELECT generate_monthly_billing('2026-01-01'::date)`);

      const result = await client.query(
        `SELECT active_user_count, total_due_eur FROM gym_billing_records WHERE gym_id = $1`,
        [gymId]
      );

      expect(result.rows[0].active_user_count).toBe(3);
      expect(parseFloat(result.rows[0].total_due_eur)).toBe(1.50);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('is idempotent (double call does not duplicate)', async () => {
    // ON CONFLICT (gym_id, period_start) DO NOTHING ensures calling the
    // function twice produces the same result as calling it once.
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Idempotent Billing Gym');
      const routeId = await createTestRoute(client, gymId, 'Idempotent Route');
      const userId = await createTestUser(client, 'idempotent@test.com');

      await createTestAscent(client, userId, routeId, '2026-01-15T12:00:00Z');

      // Call twice for the same month
      await client.query(`SELECT generate_monthly_billing('2026-01-01'::date)`);
      await client.query(`SELECT generate_monthly_billing('2026-01-01'::date)`);

      const result = await client.query(
        `SELECT * FROM gym_billing_records WHERE gym_id = $1`,
        [gymId]
      );

      // Still only one record, not two
      expect(result.rows).toHaveLength(1);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('handles multiple gyms in one run', async () => {
    // The function should generate billing for ALL gyms, not just one.
    await client.query('BEGIN');
    try {
      const gym1 = await createTestGym(client, 'Multi Billing Gym 1');
      const gym2 = await createTestGym(client, 'Multi Billing Gym 2');
      const route1 = await createTestRoute(client, gym1, 'Multi Route 1');
      const route2 = await createTestRoute(client, gym2, 'Multi Route 2');
      const user1 = await createTestUser(client, 'multi-1@test.com');
      const user2 = await createTestUser(client, 'multi-2@test.com');

      // One user at each gym
      await createTestAscent(client, user1, route1, '2026-01-10T12:00:00Z');
      await createTestAscent(client, user2, route2, '2026-01-15T12:00:00Z');

      await client.query(`SELECT generate_monthly_billing('2026-01-01'::date)`);

      const result = await client.query(
        `SELECT gym_id, active_user_count FROM gym_billing_records
         WHERE gym_id IN ($1, $2) ORDER BY gym_id`,
        [gym1, gym2]
      );

      // Both gyms should have billing records
      expect(result.rows).toHaveLength(2);
      // Each gym had 1 active user
      expect(result.rows[0].active_user_count).toBe(1);
      expect(result.rows[1].active_user_count).toBe(1);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('accepts target_month parameter to bill a specific month', async () => {
    // The target_month parameter is used for testing and manual re-billing.
    // It normalizes any date to the 1st of its month.
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Target Month Gym');
      const routeId = await createTestRoute(client, gymId, 'Target Month Route');
      const userId = await createTestUser(client, 'target-month@test.com');

      // User climbed in March 2026
      await createTestAscent(client, userId, routeId, '2026-03-15T12:00:00Z');

      // Generate billing specifically for March 2026
      await client.query(`SELECT generate_monthly_billing('2026-03-20'::date)`);

      const result = await client.query(
        `SELECT period_start::text, period_end::text, active_user_count
         FROM gym_billing_records WHERE gym_id = $1`,
        [gymId]
      );

      expect(result.rows).toHaveLength(1);
      // target_month of March 20 should normalize to March 1 – April 1
      expect(result.rows[0].period_start).toBe('2026-03-01');
      expect(result.rows[0].period_end).toBe('2026-04-01');
      expect(result.rows[0].active_user_count).toBe(1);

    } finally {
      await client.query('ROLLBACK');
    }
  });
});
