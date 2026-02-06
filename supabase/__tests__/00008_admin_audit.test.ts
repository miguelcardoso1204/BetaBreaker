/**
 * Integration tests for admin & audit tables (Step 2.8).
 *
 * These tests verify:
 *   - 3 new tables: audit_log, maintenance_tickets, seasons
 *   - RLS enabled on all 3 tables
 *   - 10 RLS policies controlling access (role-based: gym_admin, setter)
 *   - CHECK constraints (action, target_type, status, date ordering)
 *   - CASCADE deletes (gym/route/user deletion cascades properly)
 *   - on_route_update trigger auto-logs grade/status/tag changes
 *
 * Why admin & audit tables?
 * ─────────────────────────
 * Gym admins need an audit trail to track who changed route grades, statuses,
 * and tags (FR-O3). Maintenance tickets let climbers report route issues for
 * setters to triage (FR-I3). Seasons provide date-range context for
 * leaderboards and competitions (FR-I4).
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - All 8 migrations applied: `npx supabase db reset`
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
// Test Helpers (same patterns as previous test files)
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
 * Assigns a gym role to a user. Must be called as superuser.
 * Common roles: 'gym_admin', 'judge', 'setter', 'climber'
 *
 * The user_gym_roles table controls what actions a user can perform at a
 * specific gym. RLS policies use get_user_role(gym_id) to check the caller's
 * role, and role_rank() to compare it against the required minimum role.
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

// ===========================================================================
// Test Suite: Tables exist
// ===========================================================================

/**
 * Verify that all 3 admin/audit tables were created by the migration.
 * We query information_schema.tables — the standard SQL metadata catalog.
 */
describe('Admin & audit tables exist', () => {
  it.each([
    'audit_log',
    'maintenance_tickets',
    'seasons',
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
// Test Suite: RLS enabled
// ===========================================================================

/**
 * Verify that Row Level Security is enabled on all 3 tables.
 * With RLS enabled but no policies, only superusers can access data.
 * The migration adds policies to grant controlled access.
 */
describe('RLS enabled on admin & audit tables', () => {
  it.each([
    'audit_log',
    'maintenance_tickets',
    'seasons',
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

// ===========================================================================
// Test Suite: audit_log
// ===========================================================================

/**
 * The audit_log table stores an append-only change history for gym operations.
 * Each row records who changed what, when, and what the old/new values were.
 * The action and target_type columns use CHECK constraints to restrict values.
 */
describe('audit_log', () => {
  it('can insert an audit entry with defaults', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'audit-insert@test.com');
      const gymId = await createTestGym(client, 'Audit Insert Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Insert an audit entry — actor_id is optional, created_at defaults to now()
      const result = await client.query(
        `INSERT INTO audit_log (gym_id, actor_id, action, target_type, target_id, old_value, new_value)
         VALUES ($1, $2, 'grade_change', 'route', $3,
                 '{"canonical_grade": 10}'::jsonb, '{"canonical_grade": 14}'::jsonb)
         RETURNING id, created_at`,
        [gymId, userId, routeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].created_at).toBeTruthy();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('action CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Audit Bad Action Gym');
      const routeId = await createTestRoute(client, gymId, 5);

      // 'route_deleted' is not a valid action — only grade_change, status_change, etc.
      await expect(
        client.query(
          `INSERT INTO audit_log (gym_id, action, target_type, target_id)
           VALUES ($1, 'route_deleted', 'route', $2)`,
          [gymId, routeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('target_type CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Audit Bad Target Gym');
      const routeId = await createTestRoute(client, gymId, 8);

      // 'user' is not a valid target_type — only route, media, feedback
      await expect(
        client.query(
          `INSERT INTO audit_log (gym_id, action, target_type, target_id)
           VALUES ($1, 'grade_change', 'user', $2)`,
          [gymId, routeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('all valid actions accepted', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Audit All Actions Gym');
      const routeId = await createTestRoute(client, gymId, 12);

      // Test all 4 valid action types
      const validActions = ['grade_change', 'status_change', 'tag_change', 'media_removed'];
      for (const action of validActions) {
        const result = await client.query(
          `INSERT INTO audit_log (gym_id, action, target_type, target_id)
           VALUES ($1, $2, 'route', $3)
           RETURNING action`,
          [gymId, action, routeId]
        );
        expect(result.rows[0].action).toBe(action);
      }
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: maintenance_tickets
// ===========================================================================

/**
 * The maintenance_tickets table stores climber-reported issues with routes.
 * Tickets have a lifecycle: open → in_progress → resolved. The reporter_id
 * tracks who filed the ticket, and resolved_by tracks who fixed it.
 */
describe('maintenance_tickets', () => {
  it('can insert a ticket with defaults', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'ticket-insert@test.com');
      const gymId = await createTestGym(client, 'Ticket Insert Gym');
      const routeId = await createTestRoute(client, gymId, 15);

      // Insert a ticket — status defaults to 'open', resolved_by/resolved_at are NULL
      const result = await client.query(
        `INSERT INTO maintenance_tickets (route_id, reporter_id, description)
         VALUES ($1, $2, 'Spinning hold on move 3')
         RETURNING id, status, resolved_by, resolved_at, created_at`,
        [routeId, userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('open');       // Default status
      expect(result.rows[0].resolved_by).toBeNull();     // Not resolved yet
      expect(result.rows[0].resolved_at).toBeNull();     // Not resolved yet
      expect(result.rows[0].created_at).toBeTruthy();    // Timestamp set
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('status defaults to open', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'ticket-status-default@test.com');
      const gymId = await createTestGym(client, 'Ticket Default Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      const result = await client.query(
        `INSERT INTO maintenance_tickets (route_id, reporter_id, description)
         VALUES ($1, $2, 'Loose foothold')
         RETURNING status`,
        [routeId, userId]
      );
      // New tickets start as 'open' — waiting for setter triage
      expect(result.rows[0].status).toBe('open');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('status CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'ticket-bad-status@test.com');
      const gymId = await createTestGym(client, 'Ticket Bad Status Gym');
      const routeId = await createTestRoute(client, gymId, 12);

      // 'closed' is not a valid status — only open, in_progress, resolved
      await expect(
        client.query(
          `INSERT INTO maintenance_tickets (route_id, reporter_id, description, status)
           VALUES ($1, $2, 'Bad status test', 'closed')`,
          [routeId, userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('all valid statuses accepted', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'ticket-all-statuses@test.com');
      const gymId = await createTestGym(client, 'Ticket All Status Gym');

      // Test all 3 valid statuses — each with a different route
      const validStatuses = ['open', 'in_progress', 'resolved'];
      for (let i = 0; i < validStatuses.length; i++) {
        const routeId = await createTestRoute(client, gymId, 10 + i);
        const result = await client.query(
          `INSERT INTO maintenance_tickets (route_id, reporter_id, description, status)
           VALUES ($1, $2, $3, $4)
           RETURNING status`,
          [routeId, userId, `Test ${validStatuses[i]}`, validStatuses[i]]
        );
        expect(result.rows[0].status).toBe(validStatuses[i]);
      }
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('CASCADE: tickets deleted when route is deleted', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'ticket-route-cascade@test.com');
      const gymId = await createTestGym(client, 'Ticket Route Cascade Gym');
      const routeId = await createTestRoute(client, gymId, 14);

      // Insert a ticket for this route
      const insertResult = await client.query(
        `INSERT INTO maintenance_tickets (route_id, reporter_id, description)
         VALUES ($1, $2, 'This will be cascade-deleted')
         RETURNING id`,
        [routeId, userId]
      );
      const ticketId = insertResult.rows[0].id;

      // Delete the route — CASCADE should remove the ticket
      await client.query('DELETE FROM routes WHERE id = $1', [routeId]);

      const remaining = await client.query(
        'SELECT id FROM maintenance_tickets WHERE id = $1',
        [ticketId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: seasons
// ===========================================================================

/**
 * The seasons table organizes gym calendars into named periods.
 * Each season has a date range (start_date < end_date) and a status
 * (active or closed). Seasons belong to a gym and cascade-delete with it.
 */
describe('seasons', () => {
  it('can insert a season with defaults', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Season Insert Gym');

      // Insert a season — status defaults to 'active'
      const result = await client.query(
        `INSERT INTO seasons (gym_id, name, start_date, end_date)
         VALUES ($1, '2026 Spring', '2026-03-01', '2026-05-31')
         RETURNING id, status, created_at`,
        [gymId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('active');     // Default status
      expect(result.rows[0].created_at).toBeTruthy();   // Timestamp set
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('status defaults to active', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Season Default Gym');

      const result = await client.query(
        `INSERT INTO seasons (gym_id, name, start_date, end_date)
         VALUES ($1, 'Summer Series', '2026-06-01', '2026-08-31')
         RETURNING status`,
        [gymId]
      );
      // New seasons default to 'active' — gym admins close them when they end
      expect(result.rows[0].status).toBe('active');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('status CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Season Bad Status Gym');

      // 'upcoming' is not a valid status — only active, closed
      await expect(
        client.query(
          `INSERT INTO seasons (gym_id, name, start_date, end_date, status)
           VALUES ($1, 'Bad Season', '2026-01-01', '2026-03-31', 'upcoming')`,
          [gymId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('CHECK enforces end_date > start_date', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Season Date Check Gym');

      // end_date before start_date — CHECK constraint violation
      await expect(
        client.query(
          `INSERT INTO seasons (gym_id, name, start_date, end_date)
           VALUES ($1, 'Backwards Season', '2026-06-01', '2026-03-01')`,
          [gymId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('CASCADE: seasons deleted when gym is deleted', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Season Cascade Gym');

      // Insert a season for this gym
      const insertResult = await client.query(
        `INSERT INTO seasons (gym_id, name, start_date, end_date)
         VALUES ($1, 'Doomed Season', '2026-01-01', '2026-03-31')
         RETURNING id`,
        [gymId]
      );
      const seasonId = insertResult.rows[0].id;

      // Delete the gym — CASCADE should remove the season
      await client.query('DELETE FROM gyms WHERE id = $1', [gymId]);

      const remaining = await client.query(
        'SELECT id FROM seasons WHERE id = $1',
        [seasonId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Trigger — on_route_update (auto-audit)
// ===========================================================================

/**
 * The on_route_update trigger fires AFTER UPDATE on routes. It compares
 * OLD and NEW values for auditable columns (canonical_grade, status, color,
 * wall_section) and inserts an audit_log entry for each change.
 *
 * This ensures audit entries are created automatically without requiring
 * the service layer to manually log changes — the DB enforces the audit trail.
 */
describe('Trigger: on_route_update', () => {
  it('grade change produces an audit_log entry', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Trigger Grade Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Update the route's canonical_grade — trigger should fire
      await client.query(
        `UPDATE routes SET canonical_grade = 14 WHERE id = $1`,
        [routeId]
      );

      // Verify an audit_log entry was created for the grade change
      const result = await client.query(
        `SELECT action, target_type, target_id, old_value, new_value
         FROM audit_log
         WHERE target_id = $1 AND action = 'grade_change'`,
        [routeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].target_type).toBe('route');
      expect(result.rows[0].old_value).toEqual({ canonical_grade: 10 });
      expect(result.rows[0].new_value).toEqual({ canonical_grade: 14 });
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('status change produces an audit_log entry', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Trigger Status Gym');
      const routeId = await createTestRoute(client, gymId, 12);

      // Update the route's status — trigger should fire
      await client.query(
        `UPDATE routes SET status = 'retiring_soon' WHERE id = $1`,
        [routeId]
      );

      // Verify an audit_log entry was created for the status change
      const result = await client.query(
        `SELECT action, old_value, new_value
         FROM audit_log
         WHERE target_id = $1 AND action = 'status_change'`,
        [routeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].old_value).toEqual({ status: 'active' });
      expect(result.rows[0].new_value).toEqual({ status: 'retiring_soon' });
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('color/wall_section changes produce tag_change audit entries', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Trigger Tag Gym');
      const routeId = await createTestRoute(client, gymId, 8);

      // Update both color and wall_section — trigger should create 2 entries
      await client.query(
        `UPDATE routes SET color = 'red', wall_section = 'overhang' WHERE id = $1`,
        [routeId]
      );

      // Verify two tag_change entries were created (one for color, one for wall_section)
      const result = await client.query(
        `SELECT action, old_value, new_value
         FROM audit_log
         WHERE target_id = $1 AND action = 'tag_change'
         ORDER BY new_value::text`,
        [routeId]
      );
      expect(result.rows).toHaveLength(2);

      // Find the color change entry and wall_section change entry
      const colorEntry = result.rows.find(
        (r: { new_value: { color?: string } }) => r.new_value.color !== undefined
      );
      const wallEntry = result.rows.find(
        (r: { new_value: { wall_section?: string } }) => r.new_value.wall_section !== undefined
      );

      expect(colorEntry).toBeDefined();
      expect(colorEntry.old_value).toEqual({ color: null });
      expect(colorEntry.new_value).toEqual({ color: 'red' });

      expect(wallEntry).toBeDefined();
      expect(wallEntry.old_value).toEqual({ wall_section: null });
      expect(wallEntry.new_value).toEqual({ wall_section: 'overhang' });
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('no audit entry when non-auditable columns change', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Trigger NoLog Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Update the route's name — not an auditable column, no trigger entry expected
      await client.query(
        `UPDATE routes SET name = 'Renamed Route' WHERE id = $1`,
        [routeId]
      );

      // Verify NO audit_log entries were created
      const result = await client.query(
        `SELECT id FROM audit_log WHERE target_id = $1`,
        [routeId]
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('multiple changes in one UPDATE produce multiple log entries', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Trigger Multi Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Update grade, status, and color in a single UPDATE statement.
      // The trigger should produce 3 separate audit_log entries.
      await client.query(
        `UPDATE routes
         SET canonical_grade = 18,
             status = 'archived',
             color = 'blue'
         WHERE id = $1`,
        [routeId]
      );

      // Verify 3 audit entries: grade_change, status_change, tag_change
      const result = await client.query(
        `SELECT action FROM audit_log
         WHERE target_id = $1
         ORDER BY action`,
        [routeId]
      );
      expect(result.rows).toHaveLength(3);

      const actions = result.rows.map((r: { action: string }) => r.action);
      expect(actions).toContain('grade_change');
      expect(actions).toContain('status_change');
      expect(actions).toContain('tag_change');
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: Trigger actor_id
// ===========================================================================

/**
 * When an authenticated user updates a route, the trigger should capture
 * auth.uid() as the actor_id in the audit_log entry. This lets admins
 * see exactly who made each change.
 */
describe('Trigger actor_id', () => {
  it('trigger captures auth.uid() as actor_id when user is authenticated', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trigger-actor@test.com');
      const gymId = await createTestGym(client, 'Trigger Actor Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Assign gym_admin role so the user can update routes (RLS requires setter+)
      await assignGymRole(client, userId, gymId, 'gym_admin');

      // Switch to authenticated user — auth.uid() will return this user's UUID
      await setAuthenticatedUser(client, userId);

      // Update the route as the authenticated user
      await client.query(
        `UPDATE routes SET canonical_grade = 16 WHERE id = $1`,
        [routeId]
      );

      // Reset to superuser to query audit_log (audit_log has no authenticated SELECT without role)
      await resetToSuperuser(client);

      // Verify the audit_log entry has the correct actor_id
      const result = await client.query(
        `SELECT actor_id FROM audit_log
         WHERE target_id = $1 AND action = 'grade_change'`,
        [routeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].actor_id).toBe(userId);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: RLS — audit_log
// ===========================================================================

/**
 * Behavioral tests for the 1 RLS policy on audit_log.
 * Only gym admins can read audit entries for their gym. No one can INSERT,
 * UPDATE, or DELETE via the authenticated role — only system writes.
 */
describe('RLS: audit_log', () => {
  it('gym admin can read audit entries for their gym', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-audit-admin@test.com');
      const gymId = await createTestGym(client, 'RLS Audit Admin Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Create an audit entry as superuser (simulating trigger insert)
      await client.query(
        `INSERT INTO audit_log (gym_id, actor_id, action, target_type, target_id,
           old_value, new_value)
         VALUES ($1, $2, 'grade_change', 'route', $3,
                 '{"canonical_grade": 10}'::jsonb, '{"canonical_grade": 14}'::jsonb)`,
        [gymId, adminId, routeId]
      );

      // Switch to the gym admin — should see the audit entry
      await setAuthenticatedUser(client, adminId);

      const result = await client.query(
        `SELECT action FROM audit_log WHERE gym_id = $1`,
        [gymId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].action).toBe('grade_change');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('non-admin cannot read audit entries', async () => {
    await client.query('BEGIN');
    try {
      const regularUser = await createTestUser(client, 'rls-audit-nonadmin@test.com');
      const gymId = await createTestGym(client, 'RLS Audit NonAdmin Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // No gym role assigned — this user is just an authenticated user

      // Create an audit entry as superuser
      await client.query(
        `INSERT INTO audit_log (gym_id, action, target_type, target_id)
         VALUES ($1, 'grade_change', 'route', $2)`,
        [gymId, routeId]
      );

      // Switch to the regular user — should NOT see audit entries
      await setAuthenticatedUser(client, regularUser);

      const result = await client.query(
        `SELECT id FROM audit_log WHERE gym_id = $1`,
        [gymId]
      );
      // RLS filters out — 0 rows returned (user has no gym_admin role)
      expect(result.rows).toHaveLength(0);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('authenticated user cannot INSERT into audit_log', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-audit-no-insert@test.com');
      const gymId = await createTestGym(client, 'RLS Audit NoInsert Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Even a gym admin shouldn't be able to directly INSERT audit entries.
      // Audit entries should only come from triggers / service_role.
      await assignGymRole(client, userId, gymId, 'gym_admin');

      await setAuthenticatedUser(client, userId);

      // Try to manually insert an audit entry — should fail (no INSERT policy)
      await expect(
        client.query(
          `INSERT INTO audit_log (gym_id, action, target_type, target_id)
           VALUES ($1, 'grade_change', 'route', $2)`,
          [gymId, routeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: RLS — maintenance_tickets
// ===========================================================================

/**
 * Behavioral tests for the 4 RLS policies on maintenance_tickets.
 * Any authenticated user can report issues (INSERT with reporter_id = self).
 * Setters+ can view and update tickets. Only gym_admins can delete.
 */
describe('RLS: maintenance_tickets', () => {
  it('authenticated user can insert own ticket', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-ticket-insert@test.com');
      const gymId = await createTestGym(client, 'RLS Ticket Insert Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Switch to authenticated user — any user can report issues
      await setAuthenticatedUser(client, userId);

      // INSERT without RETURNING — the SELECT policy requires setter+ role,
      // so a plain authenticated user can INSERT but can't use RETURNING
      // (Postgres RLS requires new rows to pass SELECT policies for RETURNING).
      await client.query(
        `INSERT INTO maintenance_tickets (route_id, reporter_id, description)
         VALUES ($1, $2, 'Hold is loose')`,
        [routeId, userId]
      );

      // Verify the ticket was actually created by switching to superuser
      await resetToSuperuser(client);

      const result = await client.query(
        `SELECT description FROM maintenance_tickets
         WHERE route_id = $1 AND reporter_id = $2`,
        [routeId, userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].description).toBe('Hold is loose');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('setter can read tickets for routes at their gym', async () => {
    await client.query('BEGIN');
    try {
      const reporterId = await createTestUser(client, 'rls-ticket-reporter@test.com');
      const setterId = await createTestUser(client, 'rls-ticket-setter@test.com');
      const gymId = await createTestGym(client, 'RLS Ticket Setter Gym');
      const routeId = await createTestRoute(client, gymId, 12);

      // Assign setter role to the setter
      await assignGymRole(client, setterId, gymId, 'setter');

      // Create a ticket as superuser (simulating a climber's report)
      await client.query(
        `INSERT INTO maintenance_tickets (route_id, reporter_id, description)
         VALUES ($1, $2, 'Foot chip missing')`,
        [routeId, reporterId]
      );

      // Switch to the setter — should see the ticket
      await setAuthenticatedUser(client, setterId);

      const result = await client.query(
        `SELECT description FROM maintenance_tickets WHERE route_id = $1`,
        [routeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].description).toBe('Foot chip missing');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('non-setter cannot read tickets', async () => {
    await client.query('BEGIN');
    try {
      const reporterId = await createTestUser(client, 'rls-ticket-reporter2@test.com');
      const regularUser = await createTestUser(client, 'rls-ticket-regular@test.com');
      const gymId = await createTestGym(client, 'RLS Ticket NoRead Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // No role assigned to regularUser — just an authenticated user

      // Create a ticket as superuser
      await client.query(
        `INSERT INTO maintenance_tickets (route_id, reporter_id, description)
         VALUES ($1, $2, 'Secret ticket')`,
        [routeId, reporterId]
      );

      // Switch to the regular user — should NOT see the ticket
      await setAuthenticatedUser(client, regularUser);

      const result = await client.query(
        `SELECT id FROM maintenance_tickets WHERE route_id = $1`,
        [routeId]
      );
      // RLS filters out — 0 rows (user has no setter+ role at this gym)
      expect(result.rows).toHaveLength(0);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('setter can update ticket status', async () => {
    await client.query('BEGIN');
    try {
      const reporterId = await createTestUser(client, 'rls-ticket-reporter3@test.com');
      const setterId = await createTestUser(client, 'rls-ticket-setter2@test.com');
      const gymId = await createTestGym(client, 'RLS Ticket Update Gym');
      const routeId = await createTestRoute(client, gymId, 14);

      // Assign setter role
      await assignGymRole(client, setterId, gymId, 'setter');

      // Create a ticket as superuser
      const insertResult = await client.query(
        `INSERT INTO maintenance_tickets (route_id, reporter_id, description)
         VALUES ($1, $2, 'Needs tightening')
         RETURNING id`,
        [routeId, reporterId]
      );
      const ticketId = insertResult.rows[0].id;

      // Switch to setter — should be able to update ticket status
      await setAuthenticatedUser(client, setterId);

      const result = await client.query(
        `UPDATE maintenance_tickets SET status = 'in_progress'
         WHERE id = $1
         RETURNING status`,
        [ticketId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('in_progress');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can delete tickets', async () => {
    await client.query('BEGIN');
    try {
      const reporterId = await createTestUser(client, 'rls-ticket-reporter4@test.com');
      const adminId = await createTestUser(client, 'rls-ticket-admin@test.com');
      const gymId = await createTestGym(client, 'RLS Ticket Delete Gym');
      const routeId = await createTestRoute(client, gymId, 8);

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Create a ticket as superuser
      const insertResult = await client.query(
        `INSERT INTO maintenance_tickets (route_id, reporter_id, description)
         VALUES ($1, $2, 'Spam ticket')
         RETURNING id`,
        [routeId, reporterId]
      );
      const ticketId = insertResult.rows[0].id;

      // Switch to gym admin — should be able to delete the ticket
      await setAuthenticatedUser(client, adminId);

      const deleteResult = await client.query(
        `DELETE FROM maintenance_tickets WHERE id = $1`,
        [ticketId]
      );
      expect(deleteResult.rowCount).toBe(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: RLS — seasons
// ===========================================================================

/**
 * Behavioral tests for the 4 RLS policies on seasons.
 * Any authenticated user can read seasons (needed for leaderboard context).
 * Only gym admins can create, update, and delete seasons.
 */
describe('RLS: seasons', () => {
  it('authenticated user can read seasons', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-season-read@test.com');
      const gymId = await createTestGym(client, 'RLS Season Read Gym');

      // Create a season as superuser
      await client.query(
        `INSERT INTO seasons (gym_id, name, start_date, end_date)
         VALUES ($1, '2026 Spring', '2026-03-01', '2026-05-31')`,
        [gymId]
      );

      // Switch to any authenticated user — should see the season
      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `SELECT name FROM seasons WHERE gym_id = $1`,
        [gymId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('2026 Spring');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can create a season', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-season-create@test.com');
      const gymId = await createTestGym(client, 'RLS Season Create Gym');

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to gym admin
      await setAuthenticatedUser(client, adminId);

      // Create a season — should succeed (gym_admin INSERT policy)
      const result = await client.query(
        `INSERT INTO seasons (gym_id, name, start_date, end_date)
         VALUES ($1, 'Fall 2026', '2026-09-01', '2026-11-30')
         RETURNING id, name`,
        [gymId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Fall 2026');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can update a season', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-season-update@test.com');
      const gymId = await createTestGym(client, 'RLS Season Update Gym');

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Create a season as superuser
      const insertResult = await client.query(
        `INSERT INTO seasons (gym_id, name, start_date, end_date)
         VALUES ($1, 'Winter 2026', '2026-12-01', '2027-02-28')
         RETURNING id`,
        [gymId]
      );
      const seasonId = insertResult.rows[0].id;

      // Switch to gym admin and close the season
      await setAuthenticatedUser(client, adminId);

      const result = await client.query(
        `UPDATE seasons SET status = 'closed' WHERE id = $1 RETURNING status`,
        [seasonId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('closed');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('non-admin cannot create a season', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-season-noadmin@test.com');
      const gymId = await createTestGym(client, 'RLS Season NoAdmin Gym');

      // No gym role assigned — just an authenticated user

      await setAuthenticatedUser(client, userId);

      // Try to create a season — should fail (no gym_admin role)
      await expect(
        client.query(
          `INSERT INTO seasons (gym_id, name, start_date, end_date)
           VALUES ($1, 'Unauthorized Season', '2026-01-01', '2026-03-31')`,
          [gymId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: CASCADE deletes
// ===========================================================================

/**
 * CASCADE delete tests for the 3 new tables. These verify that deleting
 * parent rows properly cleans up child rows across foreign key relationships.
 */
describe('CASCADE deletes', () => {
  it('user delete cascades to maintenance_tickets (reporter_id)', async () => {
    await client.query('BEGIN');
    try {
      const reporterId = await createTestUser(client, 'cascade-ticket-reporter@test.com');
      const gymId = await createTestGym(client, 'Cascade Ticket Gym');
      const routeId = await createTestRoute(client, gymId, 12);

      // Create a ticket by this user
      const insertResult = await client.query(
        `INSERT INTO maintenance_tickets (route_id, reporter_id, description)
         VALUES ($1, $2, 'Cascade test ticket')
         RETURNING id`,
        [routeId, reporterId]
      );
      const ticketId = insertResult.rows[0].id;

      // Delete the user — CASCADE should remove the ticket (reporter_id CASCADE)
      await client.query('DELETE FROM auth.users WHERE id = $1', [reporterId]);

      const remaining = await client.query(
        'SELECT id FROM maintenance_tickets WHERE id = $1',
        [ticketId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('route delete cascades to maintenance_tickets', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'cascade-route-ticket@test.com');
      const gymId = await createTestGym(client, 'Cascade Route Ticket Gym');
      const routeId = await createTestRoute(client, gymId, 14);

      // Create a ticket for this route
      const insertResult = await client.query(
        `INSERT INTO maintenance_tickets (route_id, reporter_id, description)
         VALUES ($1, $2, 'Route cascade test')
         RETURNING id`,
        [routeId, userId]
      );
      const ticketId = insertResult.rows[0].id;

      // Delete the route — CASCADE should remove the ticket
      await client.query('DELETE FROM routes WHERE id = $1', [routeId]);

      const remaining = await client.query(
        'SELECT id FROM maintenance_tickets WHERE id = $1',
        [ticketId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym delete cascades to seasons and audit_log', async () => {
    await client.query('BEGIN');
    try {
      const gymId = await createTestGym(client, 'Cascade Gym Seasons');
      const routeId = await createTestRoute(client, gymId, 10);

      // Create a season for this gym
      const seasonResult = await client.query(
        `INSERT INTO seasons (gym_id, name, start_date, end_date)
         VALUES ($1, 'Doomed Season', '2026-01-01', '2026-06-30')
         RETURNING id`,
        [gymId]
      );
      const seasonId = seasonResult.rows[0].id;

      // Create an audit entry for this gym
      const auditResult = await client.query(
        `INSERT INTO audit_log (gym_id, action, target_type, target_id)
         VALUES ($1, 'grade_change', 'route', $2)
         RETURNING id`,
        [gymId, routeId]
      );
      const auditId = auditResult.rows[0].id;

      // Delete the gym — CASCADE should remove seasons and audit_log entries
      await client.query('DELETE FROM gyms WHERE id = $1', [gymId]);

      const remainingSeasons = await client.query(
        'SELECT id FROM seasons WHERE id = $1',
        [seasonId]
      );
      expect(remainingSeasons.rows).toHaveLength(0);

      const remainingAudit = await client.query(
        'SELECT id FROM audit_log WHERE id = $1',
        [auditId]
      );
      expect(remainingAudit.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
