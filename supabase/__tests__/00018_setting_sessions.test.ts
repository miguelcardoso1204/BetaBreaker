/**
 * Integration tests for setting_sessions table and get_setter_workload RPC (Step 15.3).
 *
 * These tests verify:
 *   - Table structure: columns exist, RLS enabled
 *   - RLS: setter+ can SELECT, gym_admin+ can INSERT/UPDATE/DELETE
 *   - Constraints: UNIQUE (gym_id, setter_id, scheduled_date), status CHECK
 *   - Cascades: gym delete and profile delete both cascade
 *   - Date handling: scheduled_date stores correctly, date range queries work
 *   - get_setter_workload(): correct route grouping by setter
 *
 * WHY INTEGRATION TESTS?
 * RLS policies, UNIQUE constraints, CASCADE deletes, and SECURITY DEFINER
 * functions can't be tested with mocks — we need real SQL execution against
 * the local Supabase Postgres instance.
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
 * Assigns a role to a user at a gym. Used to test RLS policies that
 * check user_gym_roles for authorization.
 */
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

/**
 * Sets the Supabase auth context so RLS evaluates as a specific user.
 * This mimics what PostgREST does when it receives an authenticated request.
 */
async function setAuthUser(txClient: Client, userId: string): Promise<void> {
  await txClient.query(`SET LOCAL role = 'authenticated'`);
  await txClient.query(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: userId })}'`);
}

/**
 * Resets to superuser role (postgres) so we can do admin operations
 * like inserting into tables without RLS restrictions.
 */
async function resetToSuperuser(txClient: Client): Promise<void> {
  await txClient.query(`RESET role`);
}

// ===========================================================================
// Table Structure
// ===========================================================================

describe('setting_sessions — table structure', () => {
  it('has expected columns', async () => {
    // Verify the migration created all expected columns with correct types
    const result = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'setting_sessions'
       ORDER BY ordinal_position`
    );

    const columns = result.rows.map((r) => r.column_name);
    expect(columns).toEqual([
      'id', 'gym_id', 'setter_id', 'scheduled_date', 'notes', 'status', 'created_at',
    ]);

    // gym_id and setter_id are NOT NULL (required for scheduling)
    const gymCol = result.rows.find((r) => r.column_name === 'gym_id');
    expect(gymCol!.is_nullable).toBe('NO');

    const setterCol = result.rows.find((r) => r.column_name === 'setter_id');
    expect(setterCol!.is_nullable).toBe('NO');

    // notes is optional
    const notesCol = result.rows.find((r) => r.column_name === 'notes');
    expect(notesCol!.is_nullable).toBe('YES');
  });

  it('has RLS enabled', async () => {
    // RLS must be enabled so PostgREST queries go through policy checks
    const result = await client.query(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'setting_sessions'`
    );
    expect(result.rows[0].relrowsecurity).toBe(true);
  });
});

// ===========================================================================
// RLS — SELECT
// ===========================================================================

describe('setting_sessions — RLS SELECT', () => {
  it('setter can read sessions at their gym', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'setter-cal@test.com');
      const gymId = await createTestGym(client, 'Cal Gym SELECT Setter');
      await assignRole(client, userId, gymId, 'setter');

      // Insert a session as superuser (bypasses RLS)
      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-03-01')`,
        [gymId, userId]
      );

      // Switch to setter role and try to read
      await setAuthUser(client, userId);
      const result = await client.query(
        `SELECT id, status FROM setting_sessions WHERE gym_id = $1`,
        [gymId]
      );

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].status).toBe('planned');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('setter cannot read sessions at another gym', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'setter-cal-other@test.com');
      const gymA = await createTestGym(client, 'Cal Gym A SELECT');
      const gymB = await createTestGym(client, 'Cal Gym B SELECT');
      await assignRole(client, userId, gymA, 'setter');

      // Insert a session at gym B
      const otherUser = await createTestUser(client, 'other-setter-cal@test.com');
      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-03-01')`,
        [gymB, otherUser]
      );

      // Setter at gym A shouldn't see gym B's sessions
      await setAuthUser(client, userId);
      const result = await client.query(
        `SELECT id FROM setting_sessions WHERE gym_id = $1`,
        [gymB]
      );

      expect(result.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('climber (no gym role) cannot read sessions', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'admin-cal-climber@test.com');
      const climberId = await createTestUser(client, 'climber-cal@test.com');
      const gymId = await createTestGym(client, 'Cal Gym Climber SELECT');
      await assignRole(client, adminId, gymId, 'gym_admin');

      // Insert a session as superuser
      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-03-01')`,
        [gymId, adminId]
      );

      // Climber has no role at this gym — blocked by RLS
      await setAuthUser(client, climberId);
      const result = await client.query(
        `SELECT id FROM setting_sessions WHERE gym_id = $1`,
        [gymId]
      );

      expect(result.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// RLS — INSERT
// ===========================================================================

describe('setting_sessions — RLS INSERT', () => {
  it('gym_admin can insert sessions', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'admin-cal-ins@test.com');
      const setterId = await createTestUser(client, 'setter-cal-ins@test.com');
      const gymId = await createTestGym(client, 'Cal Gym INSERT Admin');
      await assignRole(client, adminId, gymId, 'gym_admin');

      await setAuthUser(client, adminId);
      const result = await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date, notes)
         VALUES ($1, $2, '2026-04-01', 'Set boulder wall')`,
        [gymId, setterId]
      );

      expect(result.rowCount).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('setter cannot insert sessions', async () => {
    await client.query('BEGIN');
    try {
      const setterId = await createTestUser(client, 'setter-cal-ins-block@test.com');
      const gymId = await createTestGym(client, 'Cal Gym INSERT Setter');
      await assignRole(client, setterId, gymId, 'setter');

      await setAuthUser(client, setterId);
      // RLS INSERT policy requires gym_admin+ — setter should be blocked
      await expect(
        client.query(
          `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
           VALUES ($1, $2, '2026-04-01')`,
          [gymId, setterId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('climber cannot insert sessions', async () => {
    await client.query('BEGIN');
    try {
      const climberId = await createTestUser(client, 'climber-cal-ins@test.com');
      const gymId = await createTestGym(client, 'Cal Gym INSERT Climber');
      // No role assigned — default is climber (no gym role)

      await setAuthUser(client, climberId);
      await expect(
        client.query(
          `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
           VALUES ($1, $2, '2026-04-01')`,
          [gymId, climberId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// RLS — UPDATE
// ===========================================================================

describe('setting_sessions — RLS UPDATE', () => {
  it('gym_admin can update sessions', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'admin-cal-upd@test.com');
      const gymId = await createTestGym(client, 'Cal Gym UPDATE Admin');
      await assignRole(client, adminId, gymId, 'gym_admin');

      // Insert as superuser
      const ins = await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01') RETURNING id`,
        [gymId, adminId]
      );
      const sessionId = ins.rows[0].id;

      // Admin can update status
      await setAuthUser(client, adminId);
      const result = await client.query(
        `UPDATE setting_sessions SET status = 'completed' WHERE id = $1`,
        [sessionId]
      );

      expect(result.rowCount).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('setter update returns rowCount 0 (silent filtering)', async () => {
    await client.query('BEGIN');
    try {
      const setterId = await createTestUser(client, 'setter-cal-upd@test.com');
      const adminId = await createTestUser(client, 'admin-cal-upd2@test.com');
      const gymId = await createTestGym(client, 'Cal Gym UPDATE Setter');
      await assignRole(client, setterId, gymId, 'setter');
      await assignRole(client, adminId, gymId, 'gym_admin');

      // Insert as superuser
      const ins = await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01') RETURNING id`,
        [gymId, setterId]
      );
      const sessionId = ins.rows[0].id;

      // Setter can see but not update — UPDATE silently returns 0 rows
      await setAuthUser(client, setterId);
      const result = await client.query(
        `UPDATE setting_sessions SET status = 'cancelled' WHERE id = $1`,
        [sessionId]
      );

      expect(result.rowCount).toBe(0);

      // Verify row is unchanged via superuser
      await resetToSuperuser(client);
      const check = await client.query(
        `SELECT status FROM setting_sessions WHERE id = $1`,
        [sessionId]
      );
      expect(check.rows[0].status).toBe('planned');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('climber update returns rowCount 0', async () => {
    await client.query('BEGIN');
    try {
      const climberId = await createTestUser(client, 'climber-cal-upd@test.com');
      const adminId = await createTestUser(client, 'admin-cal-upd3@test.com');
      const gymId = await createTestGym(client, 'Cal Gym UPDATE Climber');
      await assignRole(client, adminId, gymId, 'gym_admin');

      const ins = await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01') RETURNING id`,
        [gymId, adminId]
      );
      const sessionId = ins.rows[0].id;

      // Climber has no role at this gym — can't even see the row
      await setAuthUser(client, climberId);
      const result = await client.query(
        `UPDATE setting_sessions SET status = 'cancelled' WHERE id = $1`,
        [sessionId]
      );

      expect(result.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// RLS — DELETE
// ===========================================================================

describe('setting_sessions — RLS DELETE', () => {
  it('gym_admin can delete sessions', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'admin-cal-del@test.com');
      const gymId = await createTestGym(client, 'Cal Gym DELETE Admin');
      await assignRole(client, adminId, gymId, 'gym_admin');

      const ins = await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01') RETURNING id`,
        [gymId, adminId]
      );
      const sessionId = ins.rows[0].id;

      await setAuthUser(client, adminId);
      const result = await client.query(
        `DELETE FROM setting_sessions WHERE id = $1`,
        [sessionId]
      );

      expect(result.rowCount).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('setter delete returns rowCount 0', async () => {
    await client.query('BEGIN');
    try {
      const setterId = await createTestUser(client, 'setter-cal-del@test.com');
      const gymId = await createTestGym(client, 'Cal Gym DELETE Setter');
      await assignRole(client, setterId, gymId, 'setter');

      const ins = await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01') RETURNING id`,
        [gymId, setterId]
      );
      const sessionId = ins.rows[0].id;

      await setAuthUser(client, setterId);
      const result = await client.query(
        `DELETE FROM setting_sessions WHERE id = $1`,
        [sessionId]
      );

      expect(result.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('climber delete returns rowCount 0', async () => {
    await client.query('BEGIN');
    try {
      const climberId = await createTestUser(client, 'climber-cal-del@test.com');
      const adminId = await createTestUser(client, 'admin-cal-del2@test.com');
      const gymId = await createTestGym(client, 'Cal Gym DELETE Climber');
      await assignRole(client, adminId, gymId, 'gym_admin');

      const ins = await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01') RETURNING id`,
        [gymId, adminId]
      );
      const sessionId = ins.rows[0].id;

      await setAuthUser(client, climberId);
      const result = await client.query(
        `DELETE FROM setting_sessions WHERE id = $1`,
        [sessionId]
      );

      expect(result.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Constraints
// ===========================================================================

describe('setting_sessions — constraints', () => {
  it('UNIQUE (gym_id, setter_id, scheduled_date) prevents double-booking', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'setter-uniq@test.com');
      const gymId = await createTestGym(client, 'Cal Gym UNIQUE');

      // First insert succeeds
      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01')`,
        [gymId, userId]
      );

      // Duplicate for same gym + setter + date should fail
      await expect(
        client.query(
          `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
           VALUES ($1, $2, '2026-04-01')`,
          [gymId, userId]
        )
      ).rejects.toThrow(/unique/i);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('same setter on different dates is OK', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'setter-diff-date@test.com');
      const gymId = await createTestGym(client, 'Cal Gym DiffDate');

      // Same setter, different dates — should both succeed
      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01')`,
        [gymId, userId]
      );
      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-02')`,
        [gymId, userId]
      );

      const result = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM setting_sessions WHERE gym_id = $1`,
        [gymId]
      );
      expect(result.rows[0].cnt).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('different setters on same date is OK', async () => {
    await client.query('BEGIN');
    try {
      const setter1 = await createTestUser(client, 'setter1-samedate@test.com');
      const setter2 = await createTestUser(client, 'setter2-samedate@test.com');
      const gymId = await createTestGym(client, 'Cal Gym SameDate');

      // Different setters, same date — no conflict
      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01')`,
        [gymId, setter1]
      );
      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01')`,
        [gymId, setter2]
      );

      const result = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM setting_sessions WHERE gym_id = $1`,
        [gymId]
      );
      expect(result.rows[0].cnt).toBe(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('status CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'setter-check@test.com');
      const gymId = await createTestGym(client, 'Cal Gym CHECK');

      // 'invalid_status' is not in the CHECK constraint
      await expect(
        client.query(
          `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date, status)
           VALUES ($1, $2, '2026-04-01', 'invalid_status')`,
          [gymId, userId]
        )
      ).rejects.toThrow(/check/i);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Cascades
// ===========================================================================

describe('setting_sessions — cascades', () => {
  it('deleting gym cascades to sessions', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'setter-cascade-gym@test.com');
      const gymId = await createTestGym(client, 'Cal Gym CASCADE Gym');

      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01')`,
        [gymId, userId]
      );

      // Delete the gym — CASCADE should remove the session
      await client.query(`DELETE FROM gyms WHERE id = $1`, [gymId]);

      const result = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM setting_sessions WHERE gym_id = $1`,
        [gymId]
      );
      expect(result.rows[0].cnt).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('deleting profile cascades to sessions', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'setter-cascade-prof@test.com');
      const gymId = await createTestGym(client, 'Cal Gym CASCADE Profile');

      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-01')`,
        [gymId, userId]
      );

      // Delete the auth user — cascades through profiles → setting_sessions
      await client.query(`DELETE FROM auth.users WHERE id = $1`, [userId]);

      const result = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM setting_sessions WHERE setter_id = $1`,
        [userId]
      );
      expect(result.rows[0].cnt).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Date Handling
// ===========================================================================

describe('setting_sessions — date handling', () => {
  it('stores scheduled_date correctly (cast to text avoids timezone shift)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'setter-date-store@test.com');
      const gymId = await createTestGym(client, 'Cal Gym Date Store');

      await client.query(
        `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
         VALUES ($1, $2, '2026-04-15')`,
        [gymId, userId]
      );

      // Cast to text to avoid the pg driver's timezone offset problem
      // (see MEMORY.md: Postgres date column timezone offset in pg driver)
      const result = await client.query(
        `SELECT scheduled_date::text AS sched
         FROM setting_sessions WHERE gym_id = $1`,
        [gymId]
      );
      expect(result.rows[0].sched).toBe('2026-04-15');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('date range queries filter correctly', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'setter-date-range@test.com');
      const gymId = await createTestGym(client, 'Cal Gym Date Range');

      // Insert sessions on three different dates
      for (const day of ['2026-03-01', '2026-03-15', '2026-04-01']) {
        await client.query(
          `INSERT INTO setting_sessions (gym_id, setter_id, scheduled_date)
           VALUES ($1, $2, $3)
           ON CONFLICT (gym_id, setter_id, scheduled_date) DO NOTHING`,
          [gymId, userId, day]
        );
      }

      // Query for March only — should get 2 results
      const result = await client.query(
        `SELECT scheduled_date::text AS sched
         FROM setting_sessions
         WHERE gym_id = $1
           AND scheduled_date >= '2026-03-01'
           AND scheduled_date < '2026-04-01'
         ORDER BY scheduled_date`,
        [gymId]
      );

      expect(result.rowCount).toBe(2);
      expect(result.rows[0].sched).toBe('2026-03-01');
      expect(result.rows[1].sched).toBe('2026-03-15');
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// get_setter_workload() RPC
// ===========================================================================

describe('get_setter_workload()', () => {
  it('returns route counts grouped by setter', async () => {
    await client.query('BEGIN');
    try {
      const setter1 = await createTestUser(client, 'setter-wl1@test.com');
      const setter2 = await createTestUser(client, 'setter-wl2@test.com');
      const gymId = await createTestGym(client, 'Cal Gym Workload');

      // Give setter1 a display name for the JOIN
      await client.query(
        `UPDATE profiles SET display_name = 'Alice Setter' WHERE id = $1`,
        [setter1]
      );
      await client.query(
        `UPDATE profiles SET display_name = 'Bob Setter' WHERE id = $1`,
        [setter2]
      );

      // Create routes assigned to each setter. setter1 gets 3 routes, setter2 gets 1.
      // Use specific created_at timestamps within the query range.
      for (let i = 0; i < 3; i++) {
        await client.query(
          `INSERT INTO routes (gym_id, canonical_grade, setter_id, created_at)
           VALUES ($1, $2, $3, '2026-03-10T12:00:00Z')`,
          [gymId, 10 + i, setter1]
        );
      }
      await client.query(
        `INSERT INTO routes (gym_id, canonical_grade, setter_id, created_at)
         VALUES ($1, 12, $2, '2026-03-15T12:00:00Z')`,
        [gymId, setter2]
      );

      // Call the RPC
      const result = await client.query(
        `SELECT setter_id, display_name, route_count
         FROM get_setter_workload($1, '2026-03-01', '2026-03-31')
         ORDER BY route_count DESC`,
        [gymId]
      );

      expect(result.rowCount).toBe(2);
      // setter1 has 3 routes — should be first (DESC order)
      expect(result.rows[0].display_name).toBe('Alice Setter');
      expect(Number(result.rows[0].route_count)).toBe(3);
      // setter2 has 1 route
      expect(result.rows[1].display_name).toBe('Bob Setter');
      expect(Number(result.rows[1].route_count)).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('excludes routes outside date range', async () => {
    await client.query('BEGIN');
    try {
      const setterId = await createTestUser(client, 'setter-wl-range@test.com');
      const gymId = await createTestGym(client, 'Cal Gym WL Range');
      await client.query(
        `UPDATE profiles SET display_name = 'Range Setter' WHERE id = $1`,
        [setterId]
      );

      // Route in March (inside range)
      await client.query(
        `INSERT INTO routes (gym_id, canonical_grade, setter_id, created_at)
         VALUES ($1, 10, $2, '2026-03-15T12:00:00Z')`,
        [gymId, setterId]
      );
      // Route in April (outside range)
      await client.query(
        `INSERT INTO routes (gym_id, canonical_grade, setter_id, created_at)
         VALUES ($1, 12, $2, '2026-04-05T12:00:00Z')`,
        [gymId, setterId]
      );

      const result = await client.query(
        `SELECT route_count FROM get_setter_workload($1, '2026-03-01', '2026-03-31')`,
        [gymId]
      );

      expect(result.rowCount).toBe(1);
      expect(Number(result.rows[0].route_count)).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('returns empty when no routes have a setter', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Cal Gym WL Empty');

      // Route with no setter_id — should be excluded
      await client.query(
        `INSERT INTO routes (gym_id, canonical_grade, created_at)
         VALUES ($1, 10, '2026-03-15T12:00:00Z')`,
        [gymId]
      );

      const result = await client.query(
        `SELECT route_count FROM get_setter_workload($1, '2026-03-01', '2026-03-31')`,
        [gymId]
      );

      expect(result.rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
