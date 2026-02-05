/**
 * Integration tests for the core tables migration (Step 2.1).
 *
 * These tests connect directly to the local Supabase Postgres instance
 * using the `pg` npm package. We use `information_schema` to verify that
 * tables, columns, constraints, and defaults were created correctly.
 *
 * Why `pg` instead of `@supabase/supabase-js`?
 * - PostgREST (what supabase-js talks to) can't query `information_schema`
 * - We need to verify DDL (table structure), not just DML (data operations)
 * - Direct Postgres access lets us test CHECK constraints, FKs, defaults, etc.
 *
 * Why BEGIN/ROLLBACK per test?
 * - Each test that inserts data runs inside a transaction that gets rolled back
 * - This means test data is automatically cleaned up, even if the test fails
 * - Tests don't interfere with each other (isolation)
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - Migration must be applied: `npx supabase db reset`
 */

import { Client } from 'pg';

/**
 * The connection string for the local Supabase Postgres instance.
 * Port 54322 is the default for `supabase start`.
 * We connect as the `postgres` superuser so we can:
 * - Query information_schema (metadata about tables)
 * - Bypass RLS (Row Level Security) for test data insertion
 * - Insert into auth.users (required to create profiles due to FK)
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

// ---------------------------------------------------------------------------
// Helper: create a test user in auth.users (required for profiles FK)
// ---------------------------------------------------------------------------

/**
 * Inserts a row into Supabase's `auth.users` table.
 *
 * Why do we need this?
 * - The `profiles` table has a FK to `auth.users(id)` with ON DELETE CASCADE
 * - To insert a profile (and anything that references profiles), we first
 *   need a valid auth.users row
 * - In production, Supabase Auth creates these rows when users sign up
 * - In tests, we insert them directly since we're the postgres superuser
 *
 * @param txClient - The Postgres client (inside a transaction)
 * @param email - A unique email for the test user
 * @returns The UUID of the created user
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

// ===========================================================================
// Test Suite: Tables Exist
// ===========================================================================

/**
 * Verify that all 7 core tables were created by the migration.
 * We query `information_schema.tables` which is a standard SQL view that
 * lists all tables in the database. We filter by `table_schema = 'public'`
 * because our app tables live in the public schema.
 */
describe('Tables exist', () => {
  it.each([
    'gyms',
    'profiles',
    'routes',
    'style_tags',
    'route_style_tags',
    'route_ascents',
    'user_gym_roles',
  ])('table "%s" exists in public schema', async (tableName) => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    // If the table exists, we get exactly one row back
    expect(result.rows).toHaveLength(1);
  });
});

// ===========================================================================
// Test Suite: Routes Table Columns
// ===========================================================================

/**
 * Verify that the `routes` table has the expected columns with correct types.
 * We query `information_schema.columns` which describes every column in every table.
 *
 * `udt_name` is the "user-defined type name" — for built-in types this is
 * the Postgres internal name (e.g., 'uuid', 'int4', 'text', 'timestamptz').
 */
describe('routes table columns', () => {
  it.each([
    { column: 'id', expectedType: 'uuid' },
    { column: 'gym_id', expectedType: 'uuid' },
    { column: 'canonical_grade', expectedType: 'int4' },
    { column: 'setter_id', expectedType: 'uuid' },
    { column: 'status', expectedType: 'text' },
    { column: 'created_at', expectedType: 'timestamptz' },
  ])(
    'column "$column" exists with type "$expectedType"',
    async ({ column, expectedType }) => {
      const result = await client.query(
        `SELECT udt_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'routes'
           AND column_name = $1`,
        [column]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].udt_name).toBe(expectedType);
    }
  );
});

// ===========================================================================
// Test Suite: Foreign Keys
// ===========================================================================

/**
 * Verify foreign key relationships between tables.
 *
 * We check two things:
 * 1. The FK constraint exists in information_schema (metadata check)
 * 2. CASCADE DELETE works (behavioral check — deleting a parent removes children)
 *
 * information_schema.referential_constraints lists all FK relationships.
 * We join with table_constraints to get the table that owns the FK.
 */
describe('Foreign keys', () => {
  it('route_ascents.route_id references routes.id', async () => {
    // Query the information_schema to find FK constraints on route_ascents
    // that reference the routes table
    const result = await client.query(
      `SELECT
         kcu.column_name,
         ccu.table_name AS referenced_table,
         ccu.column_name AS referenced_column
       FROM information_schema.key_column_usage kcu
       JOIN information_schema.constraint_column_usage ccu
         ON kcu.constraint_name = ccu.constraint_name
         AND kcu.constraint_schema = ccu.constraint_schema
       JOIN information_schema.table_constraints tc
         ON kcu.constraint_name = tc.constraint_name
         AND kcu.constraint_schema = tc.constraint_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND kcu.table_name = 'route_ascents'
         AND kcu.column_name = 'route_id'`
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].referenced_table).toBe('routes');
    expect(result.rows[0].referenced_column).toBe('id');
  });

  it('CASCADE DELETE: deleting a route removes its ascents', async () => {
    // Run everything inside a transaction so we can roll back and leave
    // the database clean regardless of test outcome
    await client.query('BEGIN');

    try {
      // Step 1: Create a test user in auth.users (profiles FK requires this)
      const userId = await createTestUser(client, 'cascade-test@example.com');

      // Step 2: Create a gym (routes FK requires this)
      const gymResult = await client.query(
        `INSERT INTO gyms (name, default_grade_system)
         VALUES ('Test Gym', 'v-scale')
         RETURNING id`
      );
      const gymId = gymResult.rows[0].id;

      // Step 3: Create a profile (route_ascents FK requires this)
      await client.query(
        `INSERT INTO profiles (id, preferred_grade_system)
         VALUES ($1, 'v-scale')`,
        [userId]
      );

      // Step 4: Create a route
      const routeResult = await client.query(
        `INSERT INTO routes (gym_id, canonical_grade)
         VALUES ($1, 10)
         RETURNING id`,
        [gymId]
      );
      const routeId = routeResult.rows[0].id;

      // Step 5: Create an ascent linked to that route
      await client.query(
        `INSERT INTO route_ascents (user_id, route_id, status)
         VALUES ($1, $2, 'flash')`,
        [userId, routeId]
      );

      // Step 6: Delete the route — CASCADE should also delete the ascent
      await client.query('DELETE FROM routes WHERE id = $1', [routeId]);

      // Step 7: Verify the ascent was automatically deleted
      const remaining = await client.query(
        'SELECT id FROM route_ascents WHERE route_id = $1',
        [routeId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      // Roll back so test data doesn't persist
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Check Constraints
// ===========================================================================

/**
 * CHECK constraints enforce allowed values at the database level.
 * Even if a bug in the app sends a bad value, Postgres will reject it.
 * This is the "hard security boundary" mentioned in the architecture docs.
 *
 * We test both the rejection case (invalid value → error) and the
 * acceptance case (valid value → success) to ensure the constraint
 * is correctly defined.
 */
describe('Check constraints', () => {
  it('rejects invalid route_ascents.status', async () => {
    await client.query('BEGIN');

    try {
      // Set up the required parent rows
      const userId = await createTestUser(client, 'check-reject@example.com');
      const gymResult = await client.query(
        `INSERT INTO gyms (name, default_grade_system)
         VALUES ('Check Gym', 'v-scale') RETURNING id`
      );
      const gymId = gymResult.rows[0].id;
      await client.query(
        `INSERT INTO profiles (id, preferred_grade_system)
         VALUES ($1, 'v-scale')`,
        [userId]
      );
      const routeResult = await client.query(
        `INSERT INTO routes (gym_id, canonical_grade) VALUES ($1, 5) RETURNING id`,
        [gymId]
      );
      const routeId = routeResult.rows[0].id;

      // Attempt to insert an ascent with an invalid status value.
      // This should throw a CHECK constraint violation error.
      await expect(
        client.query(
          `INSERT INTO route_ascents (user_id, route_id, status)
           VALUES ($1, $2, 'invalid')`,
          [userId, routeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('accepts valid route_ascents.status = "flash"', async () => {
    await client.query('BEGIN');

    try {
      // Same setup as above
      const userId = await createTestUser(client, 'check-accept@example.com');
      const gymResult = await client.query(
        `INSERT INTO gyms (name, default_grade_system)
         VALUES ('Check Gym 2', 'v-scale') RETURNING id`
      );
      const gymId = gymResult.rows[0].id;
      await client.query(
        `INSERT INTO profiles (id, preferred_grade_system)
         VALUES ($1, 'v-scale')`,
        [userId]
      );
      const routeResult = await client.query(
        `INSERT INTO routes (gym_id, canonical_grade) VALUES ($1, 5) RETURNING id`,
        [gymId]
      );
      const routeId = routeResult.rows[0].id;

      // This should succeed — 'flash' is a valid status
      const result = await client.query(
        `INSERT INTO route_ascents (user_id, route_id, status)
         VALUES ($1, $2, 'flash') RETURNING id`,
        [userId, routeId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Default Values
// ===========================================================================

/**
 * Default values ensure that columns get sensible values when not explicitly
 * provided. This is important for:
 * - `status` → new routes start as 'active'
 * - `created_at` → automatically timestamped on insert
 * - `attempts` → at least 1 attempt per ascent
 *
 * We verify these by inserting rows without specifying these columns,
 * then reading back the auto-filled values.
 */
describe('Default values', () => {
  it('routes.status defaults to "active"', async () => {
    await client.query('BEGIN');

    try {
      const gymResult = await client.query(
        `INSERT INTO gyms (name, default_grade_system)
         VALUES ('Default Gym', 'v-scale') RETURNING id`
      );
      const gymId = gymResult.rows[0].id;

      // Insert a route WITHOUT specifying `status` — it should default to 'active'
      const routeResult = await client.query(
        `INSERT INTO routes (gym_id, canonical_grade)
         VALUES ($1, 15) RETURNING status`,
        [gymId]
      );
      expect(routeResult.rows[0].status).toBe('active');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('routes.created_at defaults to approximately now()', async () => {
    await client.query('BEGIN');

    try {
      const gymResult = await client.query(
        `INSERT INTO gyms (name, default_grade_system)
         VALUES ('Timestamp Gym', 'v-scale') RETURNING id`
      );
      const gymId = gymResult.rows[0].id;

      // Insert a route WITHOUT specifying `created_at`
      const routeResult = await client.query(
        `INSERT INTO routes (gym_id, canonical_grade)
         VALUES ($1, 20) RETURNING created_at`,
        [gymId]
      );

      // The default should be very close to "now" — within 5 seconds
      const createdAt = new Date(routeResult.rows[0].created_at);
      const now = new Date();
      const diffMs = Math.abs(now.getTime() - createdAt.getTime());
      expect(diffMs).toBeLessThan(5000);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('route_ascents.attempts defaults to 1', async () => {
    await client.query('BEGIN');

    try {
      const userId = await createTestUser(client, 'default-attempts@example.com');
      const gymResult = await client.query(
        `INSERT INTO gyms (name, default_grade_system)
         VALUES ('Attempts Gym', 'v-scale') RETURNING id`
      );
      const gymId = gymResult.rows[0].id;
      await client.query(
        `INSERT INTO profiles (id, preferred_grade_system)
         VALUES ($1, 'v-scale')`,
        [userId]
      );
      const routeResult = await client.query(
        `INSERT INTO routes (gym_id, canonical_grade) VALUES ($1, 8) RETURNING id`,
        [gymId]
      );
      const routeId = routeResult.rows[0].id;

      // Insert an ascent WITHOUT specifying `attempts` — should default to 1
      const ascentResult = await client.query(
        `INSERT INTO route_ascents (user_id, route_id, status)
         VALUES ($1, $2, 'send') RETURNING attempts`,
        [userId, routeId]
      );
      expect(ascentResult.rows[0].attempts).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: UUID Generation
// ===========================================================================

/**
 * Verify that primary key columns with `DEFAULT gen_random_uuid()` actually
 * auto-generate UUIDs when no value is provided on insert.
 *
 * We check the column_default in information_schema to confirm the default
 * expression is `gen_random_uuid()`.
 */
describe('UUID generation', () => {
  it('routes.id default contains gen_random_uuid()', async () => {
    const result = await client.query(
      `SELECT column_default FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'routes'
         AND column_name = 'id'`
    );

    expect(result.rows).toHaveLength(1);
    // The default expression should contain gen_random_uuid()
    expect(result.rows[0].column_default).toContain('gen_random_uuid()');
  });
});

// ===========================================================================
// Test Suite: Indexes
// ===========================================================================

/**
 * Verify that the performance indexes defined in the migration exist.
 * Indexes speed up queries that filter or join on these columns.
 * Without them, Postgres would do full table scans on large tables.
 *
 * We query pg_indexes (a Postgres system view) to check index existence.
 */
describe('Indexes', () => {
  it.each([
    { indexName: 'idx_routes_gym_id', tableName: 'routes' },
    { indexName: 'idx_routes_status', tableName: 'routes' },
    { indexName: 'idx_route_ascents_user_id', tableName: 'route_ascents' },
    { indexName: 'idx_route_ascents_route_id', tableName: 'route_ascents' },
    { indexName: 'idx_user_gym_roles_gym_id', tableName: 'user_gym_roles' },
  ])(
    'index "$indexName" exists on "$tableName"',
    async ({ indexName, tableName }) => {
      const result = await client.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = $1
           AND indexname = $2`,
        [tableName, indexName]
      );
      expect(result.rows).toHaveLength(1);
    }
  );
});

// ===========================================================================
// Test Suite: RLS Enabled
// ===========================================================================

/**
 * Verify that Row Level Security (RLS) is enabled on all 7 tables.
 *
 * Why RLS?
 * - RLS is Postgres's built-in authorization system
 * - When enabled, every query is filtered by policies you define
 * - With RLS on but no policies, only superusers can access the data
 * - This is "secure by default" — we add policies in Step 2.2
 *
 * We query pg_class (a Postgres system catalog) where `relrowsecurity`
 * is true when RLS is enabled on a table.
 */
describe('RLS enabled', () => {
  it.each([
    'gyms',
    'profiles',
    'routes',
    'style_tags',
    'route_style_tags',
    'route_ascents',
    'user_gym_roles',
  ])('RLS is enabled on "%s"', async (tableName) => {
    const result = await client.query(
      `SELECT relrowsecurity FROM pg_class
       WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
      [tableName]
    );
    expect(result.rows).toHaveLength(1);
    // relrowsecurity is a boolean — true means RLS is enabled
    expect(result.rows[0].relrowsecurity).toBe(true);
  });
});
