/**
 * Integration tests for competition & event tables (Step 2.6).
 *
 * These tests verify:
 *   - 4 new tables: events, event_routes, event_categories, competition_scores
 *   - RLS enabled on all 4 tables
 *   - ~13 RLS policies controlling access (role-based: gym_admin, judge)
 *   - CHECK constraints (scoring_model, status, date ordering)
 *   - CASCADE deletes (gym/event/route/user deletion cascades properly)
 *   - Composite unique constraints (one score per athlete per route per event)
 *
 * Why competitions & events?
 * ──────────────────────────
 * Indoor climbing gyms host bouldering and lead competitions where athletes
 * climb event-specific routes, earn scores, and compete in categories
 * (e.g., "Men Open", "Women U18"). This migration supports:
 *   - FR-H1: Event creation and management by gym admins
 *   - FR-H2: Score entry by athletes (own scores) and judges (any score)
 *   - FR-H3: Category-based competition brackets
 *   - FR-H4: Event-route linking (which routes are in the competition)
 *   - FR-H5: Leaderboards/results computed from competition_scores
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - All 6 migrations applied: `npx supabase db reset`
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
 * Creates a test event at a gym. Returns the event's UUID.
 * Uses sensible defaults for dates and scoring model.
 */
async function createTestEvent(
  txClient: Client,
  gymId: string,
  createdBy: string,
  name: string = 'Test Comp',
): Promise<string> {
  const result = await txClient.query(
    `INSERT INTO events (gym_id, name, scoring_model, start_date, end_date, created_by)
     VALUES ($1, $2, 'points', now(), now() + interval '1 day', $3)
     RETURNING id`,
    [gymId, name, createdBy]
  );
  return result.rows[0].id;
}

/**
 * Assigns a gym role to a user. Must be called as superuser.
 * Common roles: 'gym_admin', 'judge', 'setter', 'climber'
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
// Test Suite: Competition tables exist
// ===========================================================================

/**
 * Verify that all 4 competition/event tables were created by the migration.
 * We query information_schema.tables — the standard SQL metadata catalog.
 */
describe('Competition tables exist', () => {
  it.each([
    'events',
    'event_routes',
    'event_categories',
    'competition_scores',
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
// Test Suite: RLS enabled on competition tables
// ===========================================================================

/**
 * Verify that Row Level Security is enabled on all 4 competition tables.
 * With RLS enabled but no policies, only superusers can access data.
 * The migration adds policies to grant controlled access.
 */
describe('RLS enabled on competition tables', () => {
  it.each([
    'events',
    'event_routes',
    'event_categories',
    'competition_scores',
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
// Test Suite: events
// ===========================================================================

/**
 * The events table stores competition/event definitions (FR-H1).
 * Each event belongs to a gym, has a scoring model, date range, and status.
 * The scoring_model determines how athlete scores are calculated.
 * The status tracks the event lifecycle from draft → completed/cancelled.
 */
describe('events', () => {
  it('can insert an event with valid scoring_model and dates', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'event-insert@test.com');
      const gymId = await createTestGym(client, 'Event Gym');

      // Insert an event — end_date must be after start_date
      const result = await client.query(
        `INSERT INTO events (gym_id, name, scoring_model, start_date, end_date, created_by)
         VALUES ($1, 'Spring Boulder Comp', 'tops_and_zones',
                 '2026-03-01T09:00:00Z', '2026-03-01T17:00:00Z', $2)
         RETURNING id, status, scoring_model`,
        [gymId, userId]
      );
      expect(result.rows).toHaveLength(1);
      // Status defaults to 'draft' — admin must explicitly open registration
      expect(result.rows[0].status).toBe('draft');
      expect(result.rows[0].scoring_model).toBe('tops_and_zones');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('scoring_model CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'event-bad-scoring@test.com');
      const gymId = await createTestGym(client, 'Bad Scoring Gym');

      // 'speed_climbing' is not a valid scoring model
      await expect(
        client.query(
          `INSERT INTO events (gym_id, name, scoring_model, start_date, end_date, created_by)
           VALUES ($1, 'Bad Event', 'speed_climbing',
                   '2026-03-01T09:00:00Z', '2026-03-01T17:00:00Z', $2)`,
          [gymId, userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('status CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'event-bad-status@test.com');
      const gymId = await createTestGym(client, 'Bad Status Gym');

      // 'archived' is not a valid event status
      await expect(
        client.query(
          `INSERT INTO events (gym_id, name, scoring_model, start_date, end_date, status, created_by)
           VALUES ($1, 'Bad Status Event', 'points',
                   '2026-03-01T09:00:00Z', '2026-03-01T17:00:00Z', 'archived', $2)`,
          [gymId, userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('end_date must be after start_date (CHECK constraint)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'event-bad-dates@test.com');
      const gymId = await createTestGym(client, 'Bad Dates Gym');

      // end_date is BEFORE start_date — CHECK (end_date > start_date) rejects this
      await expect(
        client.query(
          `INSERT INTO events (gym_id, name, scoring_model, start_date, end_date, created_by)
           VALUES ($1, 'Backwards Event', 'points',
                   '2026-03-01T17:00:00Z', '2026-03-01T09:00:00Z', $2)`,
          [gymId, userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('all valid scoring_model values accepted', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'event-all-scoring@test.com');
      const gymId = await createTestGym(client, 'All Scoring Gym');

      // Test all 4 valid scoring models
      for (const model of ['tops_and_zones', 'points', 'thousand_divide_by', 'redpoint']) {
        const result = await client.query(
          `INSERT INTO events (gym_id, name, scoring_model, start_date, end_date, created_by)
           VALUES ($1, $2, $3, now(), now() + interval '1 day', $4)
           RETURNING scoring_model`,
          [gymId, `${model} Event`, model, userId]
        );
        expect(result.rows[0].scoring_model).toBe(model);
      }
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('event is deleted when gym is deleted (CASCADE)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'event-gym-cascade@test.com');
      const gymId = await createTestGym(client, 'Cascade Gym');

      const eventId = await createTestEvent(client, gymId, userId, 'Doomed Event');

      // Delete the gym — CASCADE should remove the event too
      await client.query('DELETE FROM gyms WHERE id = $1', [gymId]);

      const remaining = await client.query(
        'SELECT id FROM events WHERE id = $1',
        [eventId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: event_routes
// ===========================================================================

/**
 * event_routes is a junction table linking events to routes (FR-H4).
 * The composite PK (event_id, route_id) prevents the same route from
 * being added to an event twice. sort_order controls display ordering.
 */
describe('event_routes', () => {
  it('can link a route to an event with sort_order', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'er-link@test.com');
      const gymId = await createTestGym(client, 'Event Route Gym');
      const routeId = await createTestRoute(client, gymId, 12);
      const eventId = await createTestEvent(client, gymId, userId);

      const result = await client.query(
        `INSERT INTO event_routes (event_id, route_id, sort_order)
         VALUES ($1, $2, 1)
         RETURNING event_id, route_id, sort_order`,
        [eventId, routeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].sort_order).toBe(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('sort_order defaults to 0', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'er-default-sort@test.com');
      const gymId = await createTestGym(client, 'Default Sort Gym');
      const routeId = await createTestRoute(client, gymId, 5);
      const eventId = await createTestEvent(client, gymId, userId);

      const result = await client.query(
        `INSERT INTO event_routes (event_id, route_id)
         VALUES ($1, $2)
         RETURNING sort_order`,
        [eventId, routeId]
      );
      expect(result.rows[0].sort_order).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('duplicate route in same event rejected by PK', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'er-dup@test.com');
      const gymId = await createTestGym(client, 'Dup Route Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const eventId = await createTestEvent(client, gymId, userId);

      // First link succeeds
      await client.query(
        `INSERT INTO event_routes (event_id, route_id) VALUES ($1, $2)`,
        [eventId, routeId]
      );

      // Second link for same event+route — PK violation
      await expect(
        client.query(
          `INSERT INTO event_routes (event_id, route_id) VALUES ($1, $2)`,
          [eventId, routeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('event_routes deleted when event is deleted (CASCADE)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'er-event-cascade@test.com');
      const gymId = await createTestGym(client, 'ER Event Cascade Gym');
      const routeId = await createTestRoute(client, gymId, 8);
      const eventId = await createTestEvent(client, gymId, userId);

      await client.query(
        `INSERT INTO event_routes (event_id, route_id) VALUES ($1, $2)`,
        [eventId, routeId]
      );

      // Delete the event — CASCADE should remove the event_routes row
      await client.query('DELETE FROM events WHERE id = $1', [eventId]);

      const remaining = await client.query(
        'SELECT * FROM event_routes WHERE event_id = $1',
        [eventId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('event_routes deleted when route is deleted (CASCADE)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'er-route-cascade@test.com');
      const gymId = await createTestGym(client, 'ER Route Cascade Gym');
      const routeId = await createTestRoute(client, gymId, 14);
      const eventId = await createTestEvent(client, gymId, userId);

      await client.query(
        `INSERT INTO event_routes (event_id, route_id) VALUES ($1, $2)`,
        [eventId, routeId]
      );

      // Delete the route — CASCADE should remove the event_routes row
      await client.query('DELETE FROM routes WHERE id = $1', [routeId]);

      const remaining = await client.query(
        'SELECT * FROM event_routes WHERE route_id = $1',
        [routeId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: event_categories
// ===========================================================================

/**
 * event_categories defines competition brackets (FR-H3).
 * Examples: "Men Open", "Women U18", "Youth A". Each category
 * is unique per event (UNIQUE constraint on event_id + name).
 */
describe('event_categories', () => {
  it('can create a category for an event', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'ec-insert@test.com');
      const gymId = await createTestGym(client, 'Category Gym');
      const eventId = await createTestEvent(client, gymId, userId);

      const result = await client.query(
        `INSERT INTO event_categories (event_id, name)
         VALUES ($1, 'Men Open')
         RETURNING id, name`,
        [eventId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Men Open');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('UNIQUE(event_id, name) rejects duplicate category names per event', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'ec-dup@test.com');
      const gymId = await createTestGym(client, 'Dup Category Gym');
      const eventId = await createTestEvent(client, gymId, userId);

      // First category succeeds
      await client.query(
        `INSERT INTO event_categories (event_id, name)
         VALUES ($1, 'Women Open')`,
        [eventId]
      );

      // Same name in same event — UNIQUE violation
      await expect(
        client.query(
          `INSERT INTO event_categories (event_id, name)
           VALUES ($1, 'Women Open')`,
          [eventId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('same category name allowed in different events', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'ec-diff-event@test.com');
      const gymId = await createTestGym(client, 'Diff Event Category Gym');
      const eventId1 = await createTestEvent(client, gymId, userId, 'Spring Comp');
      const eventId2 = await createTestEvent(client, gymId, userId, 'Fall Comp');

      // "Men Open" in event 1
      await client.query(
        `INSERT INTO event_categories (event_id, name) VALUES ($1, 'Men Open')`,
        [eventId1]
      );

      // "Men Open" in event 2 — different event, so UNIQUE allows it
      const result = await client.query(
        `INSERT INTO event_categories (event_id, name) VALUES ($1, 'Men Open')
         RETURNING id`,
        [eventId2]
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('categories deleted when event is deleted (CASCADE)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'ec-cascade@test.com');
      const gymId = await createTestGym(client, 'EC Cascade Gym');
      const eventId = await createTestEvent(client, gymId, userId);

      await client.query(
        `INSERT INTO event_categories (event_id, name) VALUES ($1, 'Youth A')`,
        [eventId]
      );

      // Delete the event — CASCADE should remove categories
      await client.query('DELETE FROM events WHERE id = $1', [eventId]);

      const remaining = await client.query(
        'SELECT * FROM event_categories WHERE event_id = $1',
        [eventId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: competition_scores
// ===========================================================================

/**
 * competition_scores stores athlete performance in events (FR-H2).
 * Each row represents one athlete's score on one route in one event.
 * The UNIQUE constraint (event_id, user_id, route_id) ensures one
 * score per athlete per route per event.
 */
describe('competition_scores', () => {
  it('can insert a score with defaults', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'cs-insert@test.com');
      const gymId = await createTestGym(client, 'Score Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const eventId = await createTestEvent(client, gymId, userId);

      const result = await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id, score)
         VALUES ($1, $2, $3, 100)
         RETURNING id, score, category_id, verified_by`,
        [eventId, userId, routeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].score).toBe(100);
      // category_id and verified_by are nullable — should be null by default
      expect(result.rows[0].category_id).toBeNull();
      expect(result.rows[0].verified_by).toBeNull();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('score defaults to 0', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'cs-default-score@test.com');
      const gymId = await createTestGym(client, 'Default Score Gym');
      const routeId = await createTestRoute(client, gymId, 5);
      const eventId = await createTestEvent(client, gymId, userId);

      // Insert without specifying score — should default to 0
      const result = await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id)
         VALUES ($1, $2, $3)
         RETURNING score`,
        [eventId, userId, routeId]
      );
      expect(result.rows[0].score).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('UNIQUE(event_id, user_id, route_id) prevents duplicate scores', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'cs-dup@test.com');
      const gymId = await createTestGym(client, 'Dup Score Gym');
      const routeId = await createTestRoute(client, gymId, 12);
      const eventId = await createTestEvent(client, gymId, userId);

      // First score succeeds
      await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id, score)
         VALUES ($1, $2, $3, 50)`,
        [eventId, userId, routeId]
      );

      // Same event + user + route — UNIQUE violation
      await expect(
        client.query(
          `INSERT INTO competition_scores (event_id, user_id, route_id, score)
           VALUES ($1, $2, $3, 75)`,
          [eventId, userId, routeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('scores deleted when event is deleted (CASCADE)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'cs-event-cascade@test.com');
      const gymId = await createTestGym(client, 'CS Event Cascade Gym');
      const routeId = await createTestRoute(client, gymId, 8);
      const eventId = await createTestEvent(client, gymId, userId);

      await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id, score)
         VALUES ($1, $2, $3, 100)`,
        [eventId, userId, routeId]
      );

      // Delete the event — CASCADE should remove scores
      await client.query('DELETE FROM events WHERE id = $1', [eventId]);

      const remaining = await client.query(
        'SELECT * FROM competition_scores WHERE event_id = $1',
        [eventId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('scores deleted when user is deleted (CASCADE)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'cs-user-cascade@test.com');
      const gymId = await createTestGym(client, 'CS User Cascade Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const eventId = await createTestEvent(client, gymId, userId);

      await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id, score)
         VALUES ($1, $2, $3, 80)`,
        [eventId, userId, routeId]
      );

      // Delete the auth.users row — cascades to profiles → competition_scores
      await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);

      const remaining = await client.query(
        'SELECT * FROM competition_scores WHERE user_id = $1',
        [userId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('can insert score with category and verifier', async () => {
    await client.query('BEGIN');
    try {
      const athleteId = await createTestUser(client, 'cs-full@test.com');
      const judgeId = await createTestUser(client, 'cs-judge@test.com');
      const gymId = await createTestGym(client, 'Full Score Gym');
      const routeId = await createTestRoute(client, gymId, 15);
      const eventId = await createTestEvent(client, gymId, athleteId);

      // Create a category for the event
      const catResult = await client.query(
        `INSERT INTO event_categories (event_id, name)
         VALUES ($1, 'Men Open') RETURNING id`,
        [eventId]
      );
      const categoryId = catResult.rows[0].id;

      // Insert a fully-populated score with category and verifier
      const result = await client.query(
        `INSERT INTO competition_scores
           (event_id, user_id, route_id, category_id, score, verified_by)
         VALUES ($1, $2, $3, $4, 200, $5)
         RETURNING score, category_id, verified_by`,
        [eventId, athleteId, routeId, categoryId, judgeId]
      );
      expect(result.rows[0].score).toBe(200);
      expect(result.rows[0].category_id).toBe(categoryId);
      expect(result.rows[0].verified_by).toBe(judgeId);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: RLS policies on competition tables
// ===========================================================================

/**
 * Behavioral tests for the ~13 RLS policies on competition tables.
 * Pattern: create data as superuser → switch to authenticated → test access.
 *
 * Key principle: role-based access. Gym admins manage events, judges verify
 * scores, and athletes enter their own scores. All data is publicly readable
 * by authenticated users (needed for leaderboards and event browsing).
 */
describe('RLS: events', () => {
  it('authenticated user can read all events (SELECT)', async () => {
    await client.query('BEGIN');
    try {
      // Create an event as superuser
      const adminId = await createTestUser(client, 'rls-event-admin@test.com');
      const readerId = await createTestUser(client, 'rls-event-reader@test.com');
      const gymId = await createTestGym(client, 'RLS Event Gym');
      const eventId = await createTestEvent(client, gymId, adminId, 'Visible Comp');

      // Switch to a regular authenticated user — should see the event
      await setAuthenticatedUser(client, readerId);

      const result = await client.query(
        `SELECT name FROM events WHERE id = $1`,
        [eventId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Visible Comp');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can create an event (INSERT)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-event-create@test.com');
      const gymId = await createTestGym(client, 'RLS Create Event Gym');

      // Assign gym_admin role to the user
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to the gym_admin user
      await setAuthenticatedUser(client, adminId);

      // Create an event — should succeed because user is gym_admin
      const result = await client.query(
        `INSERT INTO events (gym_id, name, scoring_model, start_date, end_date, created_by)
         VALUES ($1, 'Admin Created Comp', 'points', now(), now() + interval '1 day', $2)
         RETURNING id`,
        [gymId, adminId]
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can update an event (UPDATE)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-event-update@test.com');
      const gymId = await createTestGym(client, 'RLS Update Event Gym');
      const eventId = await createTestEvent(client, gymId, adminId, 'Original Name');

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to the gym_admin user
      await setAuthenticatedUser(client, adminId);

      // Update the event name — should succeed
      const result = await client.query(
        `UPDATE events SET name = 'Updated Name' WHERE id = $1 RETURNING name`,
        [eventId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Updated Name');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can delete an event (DELETE)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-event-delete@test.com');
      const gymId = await createTestGym(client, 'RLS Delete Event Gym');
      const eventId = await createTestEvent(client, gymId, adminId, 'Doomed Comp');

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to the gym_admin user
      await setAuthenticatedUser(client, adminId);

      // Delete the event — should succeed
      const deleteResult = await client.query(
        `DELETE FROM events WHERE id = $1`,
        [eventId]
      );
      expect(deleteResult.rowCount).toBe(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('non-admin cannot create an event (INSERT rejected)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-event-nonadmin@test.com');
      const gymId = await createTestGym(client, 'RLS Non-Admin Gym');

      // User has no gym role — just a regular authenticated user
      await setAuthenticatedUser(client, userId);

      // Try to create an event — should fail because user is not gym_admin
      await expect(
        client.query(
          `INSERT INTO events (gym_id, name, scoring_model, start_date, end_date, created_by)
           VALUES ($1, 'Unauthorized Comp', 'points', now(), now() + interval '1 day', $2)`,
          [gymId, userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('RLS: event_routes', () => {
  it('authenticated user can read event_routes (SELECT)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-er-read-admin@test.com');
      const readerId = await createTestUser(client, 'rls-er-reader@test.com');
      const gymId = await createTestGym(client, 'RLS ER Read Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const eventId = await createTestEvent(client, gymId, adminId);

      // Link route to event as superuser
      await client.query(
        `INSERT INTO event_routes (event_id, route_id) VALUES ($1, $2)`,
        [eventId, routeId]
      );

      // Switch to a regular user — should see the event_routes
      await setAuthenticatedUser(client, readerId);

      const result = await client.query(
        `SELECT route_id FROM event_routes WHERE event_id = $1`,
        [eventId]
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can link routes to events (INSERT)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-er-insert@test.com');
      const gymId = await createTestGym(client, 'RLS ER Insert Gym');
      const routeId = await createTestRoute(client, gymId, 12);
      const eventId = await createTestEvent(client, gymId, adminId);

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to the gym_admin
      await setAuthenticatedUser(client, adminId);

      // Link a route to the event — should succeed
      const result = await client.query(
        `INSERT INTO event_routes (event_id, route_id, sort_order)
         VALUES ($1, $2, 1)
         RETURNING event_id`,
        [eventId, routeId]
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can unlink routes from events (DELETE)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-er-delete@test.com');
      const gymId = await createTestGym(client, 'RLS ER Delete Gym');
      const routeId = await createTestRoute(client, gymId, 8);
      const eventId = await createTestEvent(client, gymId, adminId);

      // Link route as superuser
      await client.query(
        `INSERT INTO event_routes (event_id, route_id) VALUES ($1, $2)`,
        [eventId, routeId]
      );

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to gym_admin
      await setAuthenticatedUser(client, adminId);

      // Unlink route — should succeed
      const deleteResult = await client.query(
        `DELETE FROM event_routes WHERE event_id = $1 AND route_id = $2`,
        [eventId, routeId]
      );
      expect(deleteResult.rowCount).toBe(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('RLS: event_categories', () => {
  it('authenticated user can read categories (SELECT)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-ec-read-admin@test.com');
      const readerId = await createTestUser(client, 'rls-ec-reader@test.com');
      const gymId = await createTestGym(client, 'RLS EC Read Gym');
      const eventId = await createTestEvent(client, gymId, adminId);

      // Create a category as superuser
      await client.query(
        `INSERT INTO event_categories (event_id, name) VALUES ($1, 'Men Open')`,
        [eventId]
      );

      // Switch to a regular user — should see categories
      await setAuthenticatedUser(client, readerId);

      const result = await client.query(
        `SELECT name FROM event_categories WHERE event_id = $1`,
        [eventId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Men Open');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can create categories (INSERT)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-ec-insert@test.com');
      const gymId = await createTestGym(client, 'RLS EC Insert Gym');
      const eventId = await createTestEvent(client, gymId, adminId);

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to gym_admin
      await setAuthenticatedUser(client, adminId);

      // Create a category — should succeed
      const result = await client.query(
        `INSERT INTO event_categories (event_id, name)
         VALUES ($1, 'Women U18')
         RETURNING id, name`,
        [eventId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Women U18');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can update categories (UPDATE)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-ec-update@test.com');
      const gymId = await createTestGym(client, 'RLS EC Update Gym');
      const eventId = await createTestEvent(client, gymId, adminId);

      // Create a category as superuser
      const catResult = await client.query(
        `INSERT INTO event_categories (event_id, name)
         VALUES ($1, 'Old Name') RETURNING id`,
        [eventId]
      );
      const categoryId = catResult.rows[0].id;

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to gym_admin
      await setAuthenticatedUser(client, adminId);

      // Update category name — should succeed
      const result = await client.query(
        `UPDATE event_categories SET name = 'New Name' WHERE id = $1 RETURNING name`,
        [categoryId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('New Name');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can delete categories (DELETE)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-ec-delete@test.com');
      const gymId = await createTestGym(client, 'RLS EC Delete Gym');
      const eventId = await createTestEvent(client, gymId, adminId);

      // Create a category as superuser
      const catResult = await client.query(
        `INSERT INTO event_categories (event_id, name)
         VALUES ($1, 'Doomed Category') RETURNING id`,
        [eventId]
      );
      const categoryId = catResult.rows[0].id;

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to gym_admin
      await setAuthenticatedUser(client, adminId);

      // Delete category — should succeed
      const deleteResult = await client.query(
        `DELETE FROM event_categories WHERE id = $1`,
        [categoryId]
      );
      expect(deleteResult.rowCount).toBe(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

describe('RLS: competition_scores', () => {
  it('authenticated user can read all scores (SELECT)', async () => {
    await client.query('BEGIN');
    try {
      const athleteId = await createTestUser(client, 'rls-cs-athlete@test.com');
      const readerId = await createTestUser(client, 'rls-cs-reader@test.com');
      const gymId = await createTestGym(client, 'RLS CS Read Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const eventId = await createTestEvent(client, gymId, athleteId);

      // Insert a score as superuser
      await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id, score)
         VALUES ($1, $2, $3, 150)`,
        [eventId, athleteId, routeId]
      );

      // Switch to a different user — should see the score (public leaderboards)
      await setAuthenticatedUser(client, readerId);

      const result = await client.query(
        `SELECT score FROM competition_scores WHERE event_id = $1`,
        [eventId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].score).toBe(150);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('athlete can insert own score (INSERT with user_id = auth.uid())', async () => {
    await client.query('BEGIN');
    try {
      const athleteId = await createTestUser(client, 'rls-cs-own-insert@test.com');
      const gymId = await createTestGym(client, 'RLS CS Own Insert Gym');
      const routeId = await createTestRoute(client, gymId, 12);
      const eventId = await createTestEvent(client, gymId, athleteId);

      // Switch to the athlete
      await setAuthenticatedUser(client, athleteId);

      // Insert own score — should succeed (user_id = auth.uid())
      const result = await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id, score)
         VALUES ($1, $2, $3, 75)
         RETURNING id`,
        [eventId, athleteId, routeId]
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('judge can insert score for another athlete (INSERT)', async () => {
    await client.query('BEGIN');
    try {
      const judgeId = await createTestUser(client, 'rls-cs-judge@test.com');
      const athleteId = await createTestUser(client, 'rls-cs-judged-athlete@test.com');
      const gymId = await createTestGym(client, 'RLS CS Judge Gym');
      const routeId = await createTestRoute(client, gymId, 14);
      const eventId = await createTestEvent(client, gymId, judgeId);

      // Assign judge role
      await assignGymRole(client, judgeId, gymId, 'judge');

      // Switch to the judge
      await setAuthenticatedUser(client, judgeId);

      // Insert score for another athlete — should succeed because user is a judge
      const result = await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id, score)
         VALUES ($1, $2, $3, 200)
         RETURNING id`,
        [eventId, athleteId, routeId]
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('non-judge cannot insert score for another athlete (cross-user rejected)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-cs-spoofer@test.com');
      const victimId = await createTestUser(client, 'rls-cs-victim@test.com');
      const gymId = await createTestGym(client, 'RLS CS Spoof Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const eventId = await createTestEvent(client, gymId, userId);

      // User has no special role — just authenticated
      await setAuthenticatedUser(client, userId);

      // Try to insert a score for another athlete — should fail
      // User is not a judge and user_id != auth.uid()
      await expect(
        client.query(
          `INSERT INTO competition_scores (event_id, user_id, route_id, score)
           VALUES ($1, $2, $3, 999)`,
          [eventId, victimId, routeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('judge can update scores (UPDATE)', async () => {
    await client.query('BEGIN');
    try {
      const judgeId = await createTestUser(client, 'rls-cs-judge-update@test.com');
      const athleteId = await createTestUser(client, 'rls-cs-updated-athlete@test.com');
      const gymId = await createTestGym(client, 'RLS CS Judge Update Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const eventId = await createTestEvent(client, gymId, judgeId);

      // Insert score as superuser
      await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id, score)
         VALUES ($1, $2, $3, 50)`,
        [eventId, athleteId, routeId]
      );

      // Assign judge role
      await assignGymRole(client, judgeId, gymId, 'judge');

      // Switch to judge
      await setAuthenticatedUser(client, judgeId);

      // Update the score — judges can modify any score for verification
      const result = await client.query(
        `UPDATE competition_scores SET score = 75
         WHERE event_id = $1 AND user_id = $2 AND route_id = $3
         RETURNING score`,
        [eventId, athleteId, routeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].score).toBe(75);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('non-judge cannot update scores (UPDATE rejected)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-cs-nojudge-update@test.com');
      const athleteId = await createTestUser(client, 'rls-cs-nojudge-athlete@test.com');
      const gymId = await createTestGym(client, 'RLS CS NoJudge Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const eventId = await createTestEvent(client, gymId, userId);

      // Insert score as superuser
      await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id, score)
         VALUES ($1, $2, $3, 50)`,
        [eventId, athleteId, routeId]
      );

      // User has no judge role — just authenticated
      await setAuthenticatedUser(client, userId);

      // Try to update a score — should silently affect 0 rows (USING filters it out)
      const result = await client.query(
        `UPDATE competition_scores SET score = 999
         WHERE event_id = $1 AND user_id = $2 AND route_id = $3`,
        [eventId, athleteId, routeId]
      );
      // RLS USING clause filters out the row — UPDATE sees 0 matching rows
      expect(result.rowCount).toBe(0);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('gym_admin can delete scores (DELETE)', async () => {
    await client.query('BEGIN');
    try {
      const adminId = await createTestUser(client, 'rls-cs-admin-delete@test.com');
      const athleteId = await createTestUser(client, 'rls-cs-deleted-athlete@test.com');
      const gymId = await createTestGym(client, 'RLS CS Admin Delete Gym');
      const routeId = await createTestRoute(client, gymId, 10);
      const eventId = await createTestEvent(client, gymId, adminId);

      // Insert score as superuser
      await client.query(
        `INSERT INTO competition_scores (event_id, user_id, route_id, score)
         VALUES ($1, $2, $3, 100)`,
        [eventId, athleteId, routeId]
      );

      // Assign gym_admin role
      await assignGymRole(client, adminId, gymId, 'gym_admin');

      // Switch to gym_admin
      await setAuthenticatedUser(client, adminId);

      // Delete the score — should succeed for gym_admin
      const deleteResult = await client.query(
        `DELETE FROM competition_scores WHERE event_id = $1 AND user_id = $2`,
        [eventId, athleteId]
      );
      expect(deleteResult.rowCount).toBe(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
