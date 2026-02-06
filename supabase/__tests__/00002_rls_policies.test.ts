/**
 * Integration tests for Row Level Security policies (Step 2.2).
 *
 * These tests verify that RLS policies correctly allow/deny access based on
 * user identity and role. We test three "personas":
 *   - anon       — unauthenticated (like PostgREST's `anon` role)
 *   - authenticated — logged-in user (PostgREST's `authenticated` role)
 *   - role-based — user with a specific gym role (setter, gym_admin, etc.)
 *
 * How we simulate PostgREST's auth model:
 * ─────────────────────────────────────────
 * When Supabase's PostgREST receives an HTTP request, it:
 *   1. Sets `role` to 'anon' (no JWT) or 'authenticated' (valid JWT)
 *   2. Sets `request.jwt.claims` to the full JWT payload
 *   3. Sets `request.jwt.claim.sub` to the user's UUID
 *
 * We replicate this using SET LOCAL (transaction-scoped GUC variables):
 *   SET LOCAL role = 'authenticated';
 *   SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","role":"authenticated"}';
 *   SET LOCAL "request.jwt.claim.sub" = '<uuid>';
 *
 * This is faster than sending HTTP requests through PostgREST and gives us
 * full control inside a transaction that we can ROLLBACK for test isolation.
 *
 * The Postgres function `auth.uid()` (provided by Supabase) reads from
 * `request.jwt.claim.sub`, so all RLS policies using `auth.uid()` work
 * correctly in this simulation.
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - Migrations must be applied: `npx supabase db reset`
 */

import { Client } from 'pg';

/**
 * Connection string for the local Supabase Postgres instance.
 * Port 54322 is the default for `supabase start`.
 * We connect as `postgres` superuser for setup, then switch roles for testing.
 */
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Shared client for all tests — connected once, closed in afterAll
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
 * Inserts a test user into Supabase's auth.users table.
 *
 * In production, Supabase Auth creates these rows on sign-up. In tests,
 * we insert directly since we're the postgres superuser. This is required
 * because `profiles` has a FK to `auth.users(id)` with ON DELETE CASCADE.
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

/**
 * Switches the current Postgres session to act as an authenticated user.
 *
 * This simulates what PostgREST does when it receives a request with a valid JWT:
 * - Sets the Postgres role to `authenticated` (a pre-configured role in Supabase)
 * - Sets JWT claim GUC variables so auth.uid() returns the correct user ID
 *
 * SET LOCAL means these settings only last until the end of the current transaction.
 * This is perfect for test isolation — each test wraps in BEGIN/ROLLBACK.
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
 * Switches the Postgres session to the anonymous (unauthenticated) role.
 *
 * The `anon` role in Supabase has minimal privileges. PostgREST uses this
 * role when no JWT is present. RLS policies that require auth.uid() will
 * block all access for this role.
 */
async function setAnonUser(txClient: Client): Promise<void> {
  await txClient.query(`SET LOCAL role = 'anon'`);
}

/**
 * Resets the session back to the postgres superuser.
 *
 * Used between role switches within a single transaction. The RESET command
 * restores the role to the original connection user (postgres), which
 * bypasses all RLS policies — necessary for setup steps like creating
 * test data between permission checks.
 */
// Exported for use in future test files (Step 2.3+)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function resetToSuperuser(txClient: Client): Promise<void> {
  await txClient.query('RESET role');
}

/**
 * Creates a complete test scenario with gym, users, profiles, and roles.
 *
 * This helper reduces boilerplate by setting up the common data pattern
 * needed across most RLS tests:
 *   1. A gym
 *   2. Two users with profiles
 *   3. Role assignments (if specified)
 *   4. Optionally, routes at the gym
 *
 * All data is created as the postgres superuser (bypasses RLS).
 *
 * @returns Object with IDs for all created entities
 */
async function createTestScenario(
  txClient: Client,
  options: {
    user1Role?: string;
    user2Role?: string;
    createRoutes?: boolean;
  } = {}
): Promise<{
  gymId: string;
  user1Id: string;
  user2Id: string;
  routeActiveId?: string;
  routeRetiringId?: string;
  routeArchivedId?: string;
}> {
  // Create the gym
  const gymResult = await txClient.query(
    `INSERT INTO gyms (name, default_grade_system)
     VALUES ('Test Gym', 'v-scale')
     RETURNING id`
  );
  const gymId = gymResult.rows[0].id;

  // Create two auth users
  const user1Id = await createTestUser(txClient, 'user1-' + Date.now() + '@test.com');
  const user2Id = await createTestUser(txClient, 'user2-' + Date.now() + '@test.com');

  // Create profiles for both users.
  // ON CONFLICT DO NOTHING: the handle_new_user trigger (Step 2.3) may
  // have already created these profiles — this prevents duplicate PK errors.
  await txClient.query(
    `INSERT INTO profiles (id, preferred_grade_system)
     VALUES ($1, 'v-scale'), ($2, 'v-scale')
     ON CONFLICT (id) DO NOTHING`,
    [user1Id, user2Id]
  );

  // Assign roles if specified
  if (options.user1Role) {
    await txClient.query(
      `INSERT INTO user_gym_roles (user_id, gym_id, role)
       VALUES ($1, $2, $3)`,
      [user1Id, gymId, options.user1Role]
    );
  }
  if (options.user2Role) {
    await txClient.query(
      `INSERT INTO user_gym_roles (user_id, gym_id, role)
       VALUES ($1, $2, $3)`,
      [user2Id, gymId, options.user2Role]
    );
  }

  // Create routes in different statuses if requested
  const result: {
    gymId: string;
    user1Id: string;
    user2Id: string;
    routeActiveId?: string;
    routeRetiringId?: string;
    routeArchivedId?: string;
  } = { gymId, user1Id, user2Id };

  if (options.createRoutes) {
    const activeRoute = await txClient.query(
      `INSERT INTO routes (gym_id, canonical_grade, status)
       VALUES ($1, 10, 'active') RETURNING id`,
      [gymId]
    );
    const retiringRoute = await txClient.query(
      `INSERT INTO routes (gym_id, canonical_grade, status)
       VALUES ($1, 15, 'retiring_soon') RETURNING id`,
      [gymId]
    );
    const archivedRoute = await txClient.query(
      `INSERT INTO routes (gym_id, canonical_grade, status)
       VALUES ($1, 20, 'archived') RETURNING id`,
      [gymId]
    );
    result.routeActiveId = activeRoute.rows[0].id;
    result.routeRetiringId = retiringRoute.rows[0].id;
    result.routeArchivedId = archivedRoute.rows[0].id;
  }

  return result;
}

// ===========================================================================
// Test Suite: RLS Policies Exist
// ===========================================================================

/**
 * Verify that all 23 RLS policies were created by the migration.
 *
 * We query pg_policies, a Postgres system view that lists all RLS policies.
 * This is a quick "smoke test" — if a policy is missing, we know immediately
 * without running more complex behavioral tests.
 *
 * Using it.each() for parameterized testing: each policy name is checked
 * with a single query, and Jest reports each one individually.
 */
describe('RLS policies exist', () => {
  it.each([
    // profiles (4 policies)
    { policy: 'profiles_select_authenticated', table: 'profiles' },
    { policy: 'profiles_insert_own', table: 'profiles' },
    { policy: 'profiles_update_own', table: 'profiles' },
    { policy: 'profiles_delete_own', table: 'profiles' },
    // gyms (2 policies)
    { policy: 'gyms_select_authenticated', table: 'gyms' },
    { policy: 'gyms_update_gym_admin', table: 'gyms' },
    // routes (4 policies)
    { policy: 'routes_select_authenticated', table: 'routes' },
    { policy: 'routes_insert_setter', table: 'routes' },
    { policy: 'routes_update_setter', table: 'routes' },
    { policy: 'routes_delete_gym_admin', table: 'routes' },
    // route_ascents (4 policies)
    { policy: 'ascents_select_authenticated', table: 'route_ascents' },
    { policy: 'ascents_insert_own', table: 'route_ascents' },
    { policy: 'ascents_update_own', table: 'route_ascents' },
    { policy: 'ascents_delete_own', table: 'route_ascents' },
    // user_gym_roles (4 policies — two SELECT policies merged into one)
    { policy: 'roles_select_own_or_admin', table: 'user_gym_roles' },
    { policy: 'roles_insert_gym_admin', table: 'user_gym_roles' },
    { policy: 'roles_update_gym_admin', table: 'user_gym_roles' },
    { policy: 'roles_delete_gym_admin', table: 'user_gym_roles' },
    // style_tags (1 policy)
    { policy: 'style_tags_select_authenticated', table: 'style_tags' },
    // route_style_tags (4 policies)
    { policy: 'route_style_tags_select_authenticated', table: 'route_style_tags' },
    { policy: 'route_style_tags_insert_authenticated', table: 'route_style_tags' },
    { policy: 'route_style_tags_update_setter', table: 'route_style_tags' },
    { policy: 'route_style_tags_delete_setter', table: 'route_style_tags' },
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
// Test Suite: Helper Functions
// ===========================================================================

/**
 * Test the two helper functions that RLS policies depend on:
 *   - role_rank(text) → integer: maps role names to numeric hierarchy
 *   - get_user_role(uuid) → text: looks up a user's role at a gym
 *
 * These functions are the building blocks for role-based policies.
 * If they're broken, all role-based access control fails.
 */
describe('Helper functions', () => {
  it('role_rank() returns correct hierarchy values (1–5)', async () => {
    // role_rank() is a pure function (IMMUTABLE) — no transaction needed.
    // It maps role names to integers for comparison: higher = more privilege.
    const result = await client.query(
      `SELECT
         public.role_rank('climber')     AS climber,
         public.role_rank('setter')      AS setter,
         public.role_rank('judge')       AS judge,
         public.role_rank('gym_admin')   AS gym_admin,
         public.role_rank('super_admin') AS super_admin`
    );

    const row = result.rows[0];
    expect(row.climber).toBe(1);
    expect(row.setter).toBe(2);
    expect(row.judge).toBe(3);
    expect(row.gym_admin).toBe(4);
    expect(row.super_admin).toBe(5);
  });

  it('role_rank() returns 0 for unknown role', async () => {
    // Any unrecognized string should return 0, meaning "no access"
    const result = await client.query(
      `SELECT public.role_rank('hacker') AS unknown_role`
    );
    expect(result.rows[0].unknown_role).toBe(0);
  });

  it('get_user_role() returns correct role for user at gym', async () => {
    await client.query('BEGIN');
    try {
      // Setup: create a user with setter role at a gym
      const { gymId, user1Id } = await createTestScenario(client, {
        user1Role: 'setter',
      });

      // get_user_role() needs to know who is calling. We simulate the
      // authenticated user by setting JWT claims, then call the function.
      await setAuthenticatedUser(client, user1Id);

      const result = await client.query(
        `SELECT public.get_user_role($1) AS role`,
        [gymId]
      );
      expect(result.rows[0].role).toBe('setter');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('get_user_role() returns NULL when user has no role at gym', async () => {
    await client.query('BEGIN');
    try {
      // Setup: create scenario but don't assign user1 any role
      const { gymId, user1Id } = await createTestScenario(client);

      await setAuthenticatedUser(client, user1Id);

      const result = await client.query(
        `SELECT public.get_user_role($1) AS role`,
        [gymId]
      );
      // NULL means the user has no role at this gym
      expect(result.rows[0].role).toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Anon Access
// ===========================================================================

/**
 * The `anon` role represents unauthenticated requests. In Supabase, if no
 * valid JWT is provided, PostgREST connects as `anon`. Our RLS policies
 * should block all data access for anon users — the app requires login.
 */
describe('Anon access', () => {
  it('anon cannot read routes', async () => {
    await client.query('BEGIN');
    try {
      // Setup: create a gym with an active route (as superuser)
      await createTestScenario(client, { createRoutes: true });

      // Switch to anon role — simulates an unauthenticated request
      await setAnonUser(client);

      // Anon should see 0 rows because all SELECT policies require 'authenticated'
      const result = await client.query('SELECT id FROM routes');
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Route Visibility
// ===========================================================================

/**
 * Routes have three statuses: active, retiring_soon, archived.
 * - Regular users see active + retiring_soon (they need to know what's going away)
 * - Setters and above see all routes including archived (for management)
 * - Users with no role at a gym can still browse active routes
 */
describe('Route visibility', () => {
  it('authenticated user sees active + retiring_soon, not archived', async () => {
    await client.query('BEGIN');
    try {
      // Setup: routes in all 3 statuses, user1 has no special role
      const { gymId, user1Id } = await createTestScenario(client, {
        createRoutes: true,
      });

      // Switch to authenticated user (climber with no gym role)
      await setAuthenticatedUser(client, user1Id);

      // Should see active + retiring_soon (2 routes), but NOT archived
      const result = await client.query(
        'SELECT id, status FROM routes WHERE gym_id = $1 ORDER BY status',
        [gymId]
      );
      expect(result.rows).toHaveLength(2);

      const statuses = result.rows.map((r: { status: string }) => r.status);
      expect(statuses).toContain('active');
      expect(statuses).toContain('retiring_soon');
      expect(statuses).not.toContain('archived');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('setter sees all routes (including archived) at their gym', async () => {
    await client.query('BEGIN');
    try {
      // Setup: user1 is a setter at the gym
      const { gymId, user1Id } = await createTestScenario(client, {
        user1Role: 'setter',
        createRoutes: true,
      });

      await setAuthenticatedUser(client, user1Id);

      // Setter should see all 3 routes including archived
      const result = await client.query(
        'SELECT id, status FROM routes WHERE gym_id = $1',
        [gymId]
      );
      expect(result.rows).toHaveLength(3);

      const statuses = result.rows.map((r: { status: string }) => r.status);
      expect(statuses).toContain('active');
      expect(statuses).toContain('retiring_soon');
      expect(statuses).toContain('archived');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user with no gym role can see active routes', async () => {
    await client.query('BEGIN');
    try {
      // Setup: user1 has no role at any gym
      const { user1Id } = await createTestScenario(client, {
        createRoutes: true,
      });

      await setAuthenticatedUser(client, user1Id);

      // Should still see active routes — browsing is open to all authenticated users
      const result = await client.query(
        `SELECT id FROM routes WHERE status = 'active'`
      );
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Ascent Ownership
// ===========================================================================

/**
 * Route ascents are the core logging feature. Ownership rules:
 * - Users can only INSERT ascents with their own user_id (prevents spoofing)
 * - Users can UPDATE/DELETE their own ascents
 * - All ascents are publicly readable (needed for leaderboards, social features)
 */
describe('Ascent ownership', () => {
  it('user can insert own ascent', async () => {
    await client.query('BEGIN');
    try {
      const { user1Id, routeActiveId } = await createTestScenario(client, {
        createRoutes: true,
      });

      // Switch to authenticated user1
      await setAuthenticatedUser(client, user1Id);

      // User inserting their own ascent should succeed
      const result = await client.query(
        `INSERT INTO route_ascents (user_id, route_id, status)
         VALUES ($1, $2, 'flash')
         RETURNING id`,
        [user1Id, routeActiveId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user cannot insert ascent for another user', async () => {
    await client.query('BEGIN');
    try {
      const { user1Id, user2Id, routeActiveId } = await createTestScenario(client, {
        createRoutes: true,
      });

      // Switch to user1
      await setAuthenticatedUser(client, user1Id);

      // User1 trying to insert an ascent with user2's ID should be rejected.
      // RLS WITH CHECK (user_id = auth.uid()) will cause this to fail.
      await expect(
        client.query(
          `INSERT INTO route_ascents (user_id, route_id, status)
           VALUES ($1, $2, 'send')`,
          [user2Id, routeActiveId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user can read other users\' ascents (public for leaderboards)', async () => {
    await client.query('BEGIN');
    try {
      const { user1Id, user2Id, routeActiveId } = await createTestScenario(client, {
        createRoutes: true,
      });

      // As superuser, create an ascent for user2
      await client.query(
        `INSERT INTO route_ascents (user_id, route_id, status)
         VALUES ($1, $2, 'flash')`,
        [user2Id, routeActiveId]
      );

      // Switch to user1 — should be able to read user2's ascent
      await setAuthenticatedUser(client, user1Id);

      const result = await client.query(
        `SELECT user_id FROM route_ascents WHERE user_id = $1`,
        [user2Id]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].user_id).toBe(user2Id);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Profile Access
// ===========================================================================

/**
 * Profile rules:
 * - All authenticated users can read all profiles (for leaderboards, social)
 * - Users can only modify their own profile (id = auth.uid())
 * - Users cannot create a profile for someone else
 */
describe('Profile access', () => {
  it('user can update own profile', async () => {
    await client.query('BEGIN');
    try {
      const { user1Id } = await createTestScenario(client);

      await setAuthenticatedUser(client, user1Id);

      // Updating own profile should succeed
      const result = await client.query(
        `UPDATE profiles SET display_name = 'New Name'
         WHERE id = $1
         RETURNING id`,
        [user1Id]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user cannot update other profile (0 rows affected)', async () => {
    await client.query('BEGIN');
    try {
      const { user1Id, user2Id } = await createTestScenario(client);

      // Switch to user1
      await setAuthenticatedUser(client, user1Id);

      // Trying to update user2's profile — RLS USING (id = auth.uid())
      // filters the row out, so 0 rows are affected (not an error, just no match)
      const result = await client.query(
        `UPDATE profiles SET display_name = 'Hacked Name'
         WHERE id = $1`,
        [user2Id]
      );
      expect(result.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user cannot insert profile for another user', async () => {
    await client.query('BEGIN');
    try {
      // Create two auth users (no profiles yet)
      const user1Id = await createTestUser(client, 'profile-insert1-' + Date.now() + '@test.com');
      const user2Id = await createTestUser(client, 'profile-insert2-' + Date.now() + '@test.com');

      // Create user1's own profile first (as superuser).
      // ON CONFLICT DO NOTHING: handle_new_user trigger may have already created it.
      await client.query(
        `INSERT INTO profiles (id, preferred_grade_system) VALUES ($1, 'v-scale')
         ON CONFLICT (id) DO NOTHING`,
        [user1Id]
      );

      // Switch to user1
      await setAuthenticatedUser(client, user1Id);

      // User1 trying to create a profile for user2 should be rejected
      // WITH CHECK (id = auth.uid()) blocks this
      await expect(
        client.query(
          `INSERT INTO profiles (id, preferred_grade_system)
           VALUES ($1, 'v-scale')`,
          [user2Id]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Gym Admin Route Management
// ===========================================================================

/**
 * Gym admins have elevated privileges at their gym. They can:
 * - Update any route at their gym (change status, grade, etc.)
 * - Delete routes at their gym
 * But they cannot manage routes at OTHER gyms.
 */
describe('Gym admin route management', () => {
  it('gym admin can update routes at their gym', async () => {
    await client.query('BEGIN');
    try {
      const { user1Id, routeActiveId } = await createTestScenario(client, {
        user1Role: 'gym_admin',
        createRoutes: true,
      });

      await setAuthenticatedUser(client, user1Id);

      // Gym admin updating a route at their gym should succeed
      const result = await client.query(
        `UPDATE routes SET status = 'retiring_soon'
         WHERE id = $1
         RETURNING id`,
        [routeActiveId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym admin cannot update routes at another gym (0 rows)', async () => {
    await client.query('BEGIN');
    try {
      // Create scenario with user1 as admin at gym1
      const { user1Id } = await createTestScenario(client, {
        user1Role: 'gym_admin',
      });

      // Create a second gym with a route (as superuser)
      const gym2Result = await client.query(
        `INSERT INTO gyms (name, default_grade_system)
         VALUES ('Other Gym', 'v-scale') RETURNING id`
      );
      const gym2Id = gym2Result.rows[0].id;
      const routeResult = await client.query(
        `INSERT INTO routes (gym_id, canonical_grade, status)
         VALUES ($1, 12, 'active') RETURNING id`,
        [gym2Id]
      );
      const otherRouteId = routeResult.rows[0].id;

      // Switch to user1 (admin at gym1, no role at gym2)
      await setAuthenticatedUser(client, user1Id);

      // Should not be able to update route at gym2
      const result = await client.query(
        `UPDATE routes SET status = 'archived'
         WHERE id = $1`,
        [otherRouteId]
      );
      expect(result.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Setter Route Creation
// ===========================================================================

/**
 * Route creation (INSERT) is restricted to users with setter role or higher.
 * This prevents regular climbers from adding fake routes to a gym.
 * The check is per-gym — a setter at Gym A cannot create routes at Gym B.
 */
describe('Setter route creation', () => {
  it('setter can create routes at their gym', async () => {
    await client.query('BEGIN');
    try {
      const { gymId, user1Id } = await createTestScenario(client, {
        user1Role: 'setter',
      });

      await setAuthenticatedUser(client, user1Id);

      // Setter inserting a route at their gym should succeed
      const result = await client.query(
        `INSERT INTO routes (gym_id, canonical_grade)
         VALUES ($1, 8)
         RETURNING id`,
        [gymId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('climber cannot create routes (rejected)', async () => {
    await client.query('BEGIN');
    try {
      const { gymId, user1Id } = await createTestScenario(client, {
        user1Role: 'climber',
      });

      await setAuthenticatedUser(client, user1Id);

      // Climber trying to insert a route should be rejected by RLS
      // WITH CHECK requires role_rank >= setter (2), climber is 1
      await expect(
        client.query(
          `INSERT INTO routes (gym_id, canonical_grade)
           VALUES ($1, 5)`,
          [gymId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('setter cannot create routes at a gym where they are not setter', async () => {
    await client.query('BEGIN');
    try {
      // user1 is setter at gym1
      const { user1Id } = await createTestScenario(client, {
        user1Role: 'setter',
      });

      // Create a second gym where user1 has no role
      const gym2Result = await client.query(
        `INSERT INTO gyms (name, default_grade_system)
         VALUES ('Other Gym', 'v-scale') RETURNING id`
      );
      const gym2Id = gym2Result.rows[0].id;

      await setAuthenticatedUser(client, user1Id);

      // Setter at gym1 trying to insert route at gym2 should fail
      await expect(
        client.query(
          `INSERT INTO routes (gym_id, canonical_grade)
           VALUES ($1, 10)`,
          [gym2Id]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Route Deletion
// ===========================================================================

/**
 * Route deletion is restricted to gym_admin or higher.
 * Setters can create and update routes but cannot delete them.
 * This prevents accidental data loss — only admins can permanently remove routes.
 */
describe('Route deletion', () => {
  it('gym admin can delete routes at their gym', async () => {
    await client.query('BEGIN');
    try {
      const { user1Id, routeActiveId } = await createTestScenario(client, {
        user1Role: 'gym_admin',
        createRoutes: true,
      });

      await setAuthenticatedUser(client, user1Id);

      // Gym admin deleting a route at their gym should succeed
      const result = await client.query(
        `DELETE FROM routes WHERE id = $1 RETURNING id`,
        [routeActiveId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('setter cannot delete routes (0 rows)', async () => {
    await client.query('BEGIN');
    try {
      const { user1Id, routeActiveId } = await createTestScenario(client, {
        user1Role: 'setter',
        createRoutes: true,
      });

      await setAuthenticatedUser(client, user1Id);

      // Setter trying to delete should return 0 rows (USING clause filters them out)
      const result = await client.query(
        `DELETE FROM routes WHERE id = $1`,
        [routeActiveId]
      );
      expect(result.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Role Management
// ===========================================================================

/**
 * The user_gym_roles table controls who can do what at each gym.
 * - Users can see their OWN role (SELECT where user_id = auth.uid())
 * - Gym admins can see ALL roles at their gym (for managing staff)
 * - Only gym admins can assign/change/remove roles at their gym
 * - Climbers cannot self-promote or assign roles to others
 *
 * Multiple SELECT policies are OR'd by Postgres — if ANY policy allows
 * the row, it's visible. So users see their own + admins see their gym.
 */
describe('Role management', () => {
  it('climber can see their own role only', async () => {
    await client.query('BEGIN');
    try {
      const { gymId, user1Id } = await createTestScenario(client, {
        user1Role: 'climber',
        user2Role: 'setter',
      });

      // Switch to climber (user1)
      await setAuthenticatedUser(client, user1Id);

      // User1 should only see their own role, not user2's
      const result = await client.query(
        `SELECT user_id, role FROM user_gym_roles WHERE gym_id = $1`,
        [gymId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].user_id).toBe(user1Id);
      expect(result.rows[0].role).toBe('climber');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym admin can see all roles at their gym', async () => {
    await client.query('BEGIN');
    try {
      const { gymId, user1Id } = await createTestScenario(client, {
        user1Role: 'gym_admin',
        user2Role: 'setter',
      });

      // Switch to gym admin (user1)
      await setAuthenticatedUser(client, user1Id);

      // Admin should see both their own role and user2's setter role
      const result = await client.query(
        `SELECT user_id, role FROM user_gym_roles WHERE gym_id = $1`,
        [gymId]
      );
      expect(result.rows).toHaveLength(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym admin can assign setter role at their gym', async () => {
    await client.query('BEGIN');
    try {
      // user1 is admin, user2 has a profile but no role yet
      const { gymId, user1Id, user2Id } = await createTestScenario(client, {
        user1Role: 'gym_admin',
      });

      await setAuthenticatedUser(client, user1Id);

      // Admin assigning a role to user2 at their gym should succeed
      const result = await client.query(
        `INSERT INTO user_gym_roles (user_id, gym_id, role)
         VALUES ($1, $2, 'setter')
         RETURNING user_id`,
        [user2Id, gymId]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('climber cannot insert into user_gym_roles (rejected)', async () => {
    await client.query('BEGIN');
    try {
      const { gymId, user1Id, user2Id } = await createTestScenario(client, {
        user1Role: 'climber',
      });

      await setAuthenticatedUser(client, user1Id);

      // Climber trying to grant roles should be rejected
      // role_rank('climber') = 1 < role_rank('gym_admin') = 4
      await expect(
        client.query(
          `INSERT INTO user_gym_roles (user_id, gym_id, role)
           VALUES ($1, $2, 'setter')`,
          [user2Id, gymId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Gym Management
// ===========================================================================

/**
 * Gym creation and deletion are service_role-only operations (via Edge Functions).
 * This means no authenticated user — not even gym_admin — can INSERT or DELETE
 * a gym through PostgREST. They CAN update gym settings if they're an admin.
 *
 * Regular climbers cannot update gym settings at all.
 */
describe('Gym management', () => {
  it('authenticated user cannot create a gym (rejected)', async () => {
    await client.query('BEGIN');
    try {
      const user1Id = await createTestUser(client, 'gym-create-' + Date.now() + '@test.com');
      await client.query(
        `INSERT INTO profiles (id, preferred_grade_system) VALUES ($1, 'v-scale')
         ON CONFLICT (id) DO NOTHING`,
        [user1Id]
      );

      await setAuthenticatedUser(client, user1Id);

      // No INSERT policy on gyms for authenticated role — should fail
      await expect(
        client.query(
          `INSERT INTO gyms (name, default_grade_system)
           VALUES ('Unauthorized Gym', 'v-scale')`
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('climber cannot update gym settings (0 rows)', async () => {
    await client.query('BEGIN');
    try {
      const { gymId, user1Id } = await createTestScenario(client, {
        user1Role: 'climber',
      });

      await setAuthenticatedUser(client, user1Id);

      // Climber trying to update gym settings — USING clause filters it out
      const result = await client.query(
        `UPDATE gyms SET name = 'Hacked Gym Name'
         WHERE id = $1`,
        [gymId]
      );
      expect(result.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Cascade Delete
// ===========================================================================

/**
 * This tests the FK CASCADE behavior (from Step 2.1) working correctly
 * through the RLS layer. When an auth.users row is deleted, it should
 * cascade to profiles → ascents + roles.
 *
 * This is not strictly an RLS test, but the Development Plan requires it
 * here as a regression check: ensuring RLS policies don't interfere with
 * CASCADE operations triggered by the superuser.
 */
describe('Cascade delete', () => {
  it('deleting auth.users row cascades to profiles, ascents, and roles', async () => {
    await client.query('BEGIN');
    try {
      // Setup: create full scenario with role and ascent
      const { user1Id, routeActiveId } = await createTestScenario(client, {
        user1Role: 'climber',
        createRoutes: true,
      });

      // Create an ascent for user1
      await client.query(
        `INSERT INTO route_ascents (user_id, route_id, status)
         VALUES ($1, $2, 'flash')`,
        [user1Id, routeActiveId]
      );

      // Verify data exists before delete
      const profileBefore = await client.query(
        'SELECT id FROM profiles WHERE id = $1',
        [user1Id]
      );
      expect(profileBefore.rows).toHaveLength(1);

      // Delete the auth.users row — should CASCADE to profile, ascents, roles
      await client.query('DELETE FROM auth.users WHERE id = $1', [user1Id]);

      // Profile should be gone (profiles.id references auth.users ON DELETE CASCADE)
      const profileAfter = await client.query(
        'SELECT id FROM profiles WHERE id = $1',
        [user1Id]
      );
      expect(profileAfter.rows).toHaveLength(0);

      // Ascents should be gone (route_ascents.user_id references profiles ON DELETE CASCADE)
      const ascentsAfter = await client.query(
        'SELECT id FROM route_ascents WHERE user_id = $1',
        [user1Id]
      );
      expect(ascentsAfter.rows).toHaveLength(0);

      // Roles should be gone (user_gym_roles.user_id references profiles ON DELETE CASCADE)
      const rolesAfter = await client.query(
        'SELECT user_id FROM user_gym_roles WHERE user_id = $1',
        [user1Id]
      );
      expect(rolesAfter.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
