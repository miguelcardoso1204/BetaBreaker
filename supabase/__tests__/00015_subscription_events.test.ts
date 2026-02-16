/**
 * Integration tests for subscription_events table (Step 13.1).
 *
 * These tests verify:
 *   - Table exists with correct columns
 *   - RLS is enabled and enforced
 *   - Authenticated users can SELECT their own events
 *   - Authenticated users CANNOT SELECT other users' events
 *   - Authenticated users CANNOT INSERT directly (no INSERT policy)
 *   - Service role CAN insert events (bypasses RLS)
 *   - UNIQUE constraint prevents duplicate (store, store_transaction_id)
 *   - CASCADE: deleting a profile deletes their subscription events
 *
 * WHY INTEGRATION TESTS FOR A TABLE?
 * RLS policies are Postgres-level security — they can't be tested with mocks.
 * These tests run real SQL against the local Supabase Postgres instance to
 * verify that the security boundary actually works. A bug in RLS could expose
 * billing data to unauthorized users.
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
// Test Helpers (same patterns as other integration test files)
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

// ===========================================================================
// Tests
// ===========================================================================

describe('subscription_events table', () => {

  // ── Table structure ───────────────────────────────────────────────

  it('exists with the correct columns', async () => {
    // Query the information_schema to verify the table has all expected columns.
    // This catches migration typos (wrong column name, missing column).
    const result = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subscription_events'
       ORDER BY ordinal_position`
    );

    const columns = result.rows.map((r) => r.column_name);

    expect(columns).toContain('id');
    expect(columns).toContain('user_id');
    expect(columns).toContain('event_type');
    expect(columns).toContain('store');
    expect(columns).toContain('store_transaction_id');
    expect(columns).toContain('store_product_id');
    expect(columns).toContain('receipt_data');
    expect(columns).toContain('expires_at');
    expect(columns).toContain('created_at');
  });

  it('has RLS enabled', async () => {
    // RLS must be enabled — without it, any authenticated user could read
    // every subscription event in the system.
    const result = await client.query(
      `SELECT relrowsecurity FROM pg_class
       WHERE relname = 'subscription_events'`
    );
    expect(result.rows[0].relrowsecurity).toBe(true);
  });

  // ── RLS: SELECT own events ────────────────────────────────────────

  it('allows authenticated user to SELECT their own events', async () => {
    // Create a user and insert a subscription event as superuser,
    // then switch to that user and verify they can read it.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'sub-select-own@test.com');

      // Insert as superuser (simulating the service_role Edge Function)
      await client.query(
        `INSERT INTO subscription_events (user_id, event_type, store, store_transaction_id, store_product_id)
         VALUES ($1, 'purchase', 'apple', 'txn-select-own-001', 'com.betabreaker.pro.monthly')`,
        [userId]
      );

      // Switch to the user's role
      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `SELECT * FROM subscription_events WHERE user_id = $1`,
        [userId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].event_type).toBe('purchase');

    } finally {
      await client.query('ROLLBACK');
    }
  });

  // ── RLS: Cannot SELECT other users' events ────────────────────────

  it('blocks authenticated user from reading other users events', async () => {
    await client.query('BEGIN');
    try {
      const userA = await createTestUser(client, 'sub-owner@test.com');
      const userB = await createTestUser(client, 'sub-snooper@test.com');

      // Insert event for user A (as superuser)
      await client.query(
        `INSERT INTO subscription_events (user_id, event_type, store, store_transaction_id, store_product_id)
         VALUES ($1, 'purchase', 'google', 'txn-snoop-001', 'com.betabreaker.pro.monthly')`,
        [userA]
      );

      // Switch to user B — they should NOT see user A's events
      await setAuthenticatedUser(client, userB);

      const result = await client.query(
        `SELECT * FROM subscription_events WHERE user_id = $1`,
        [userA]
      );

      // RLS should filter out the row — empty result
      expect(result.rows).toHaveLength(0);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  // ── RLS: Authenticated user cannot INSERT ─────────────────────────

  it('blocks authenticated user from direct INSERT', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'sub-insert-blocked@test.com');

      // Switch to authenticated role
      await setAuthenticatedUser(client, userId);

      // Attempt to insert directly — should be blocked by RLS
      // (no INSERT policy exists for the authenticated role)
      await expect(
        client.query(
          `INSERT INTO subscription_events (user_id, event_type, store, store_transaction_id, store_product_id)
           VALUES ($1, 'purchase', 'apple', 'txn-blocked-001', 'com.betabreaker.pro.monthly')`,
          [userId]
        )
      ).rejects.toThrow();

    } finally {
      await client.query('ROLLBACK');
    }
  });

  // ── Service role can INSERT ───────────────────────────────────────

  it('allows service role (superuser) to INSERT events', async () => {
    // Edge Functions use the service_role key which bypasses RLS.
    // The superuser in tests simulates this behavior.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'sub-service-insert@test.com');

      // Insert as superuser (simulating service_role)
      const result = await client.query(
        `INSERT INTO subscription_events (user_id, event_type, store, store_transaction_id, store_product_id, expires_at)
         VALUES ($1, 'purchase', 'apple', 'txn-service-001', 'com.betabreaker.pro.monthly', now() + interval '30 days')
         RETURNING *`,
        [userId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].store).toBe('apple');
      expect(result.rows[0].expires_at).toBeTruthy();

    } finally {
      await client.query('ROLLBACK');
    }
  });

  // ── UNIQUE constraint ─────────────────────────────────────────────

  it('prevents duplicate (store, store_transaction_id) via UNIQUE constraint', async () => {
    // Webhooks can fire multiple times for the same event. The UNIQUE
    // constraint ensures idempotent writes — the second INSERT is rejected.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'sub-unique@test.com');

      // First insert succeeds
      await client.query(
        `INSERT INTO subscription_events (user_id, event_type, store, store_transaction_id, store_product_id)
         VALUES ($1, 'purchase', 'apple', 'txn-dupe-001', 'com.betabreaker.pro.monthly')`,
        [userId]
      );

      // Second insert with same (store, transaction_id) should fail
      await expect(
        client.query(
          `INSERT INTO subscription_events (user_id, event_type, store, store_transaction_id, store_product_id)
           VALUES ($1, 'renewal', 'apple', 'txn-dupe-001', 'com.betabreaker.pro.monthly')`,
          [userId]
        )
      ).rejects.toThrow(/unique/i);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  // ── CASCADE delete ────────────────────────────────────────────────

  it('cascades deletion when the profile is deleted', async () => {
    // GDPR / account deletion: removing a user's profile should also
    // remove all their subscription events. The FK ON DELETE CASCADE handles this.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'sub-cascade@test.com');

      // Insert a subscription event
      await client.query(
        `INSERT INTO subscription_events (user_id, event_type, store, store_transaction_id, store_product_id)
         VALUES ($1, 'purchase', 'google', 'txn-cascade-001', 'com.betabreaker.pro.monthly')`,
        [userId]
      );

      // Verify event exists
      const before = await client.query(
        `SELECT count(*) FROM subscription_events WHERE user_id = $1`,
        [userId]
      );
      expect(parseInt(before.rows[0].count)).toBe(1);

      // Delete the auth.users row — cascades to profiles → subscription_events
      await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);

      // Verify event is gone
      const after = await client.query(
        `SELECT count(*) FROM subscription_events WHERE user_id = $1`,
        [userId]
      );
      expect(parseInt(after.rows[0].count)).toBe(0);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  // ── CHECK constraints ─────────────────────────────────────────────

  it('rejects invalid event_type values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'sub-check-event@test.com');

      await expect(
        client.query(
          `INSERT INTO subscription_events (user_id, event_type, store, store_transaction_id, store_product_id)
           VALUES ($1, 'invalid_type', 'apple', 'txn-check-001', 'com.betabreaker.pro.monthly')`,
          [userId]
        )
      ).rejects.toThrow();

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('rejects invalid store values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'sub-check-store@test.com');

      await expect(
        client.query(
          `INSERT INTO subscription_events (user_id, event_type, store, store_transaction_id, store_product_id)
           VALUES ($1, 'purchase', 'amazon', 'txn-check-002', 'com.betabreaker.pro.monthly')`,
          [userId]
        )
      ).rejects.toThrow();

    } finally {
      await client.query('ROLLBACK');
    }
  });
});
