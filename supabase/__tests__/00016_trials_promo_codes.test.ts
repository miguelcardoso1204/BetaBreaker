/**
 * Integration tests for promo_codes and user_trials tables (Step 13.2).
 *
 * These tests verify:
 *   - promo_codes: table structure, RLS, UNIQUE(code), CHECK(type)
 *   - user_trials: table structure, RLS, UNIQUE(user_id), CASCADE, CHECK(status)
 *   - expire_trials(): batch expiration, tier reversion, subscription protection
 *
 * WHY INTEGRATION TESTS?
 * RLS policies and trigger functions are Postgres-level security — they can't
 * be tested with mocks. These tests run real SQL against the local Supabase
 * Postgres instance to verify the security boundary actually works.
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
// promo_codes table
// ===========================================================================

describe('promo_codes table', () => {

  it('exists with the correct columns', async () => {
    // Verify the migration created the table with all expected columns.
    const result = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'promo_codes'
       ORDER BY ordinal_position`
    );

    const columns = result.rows.map((r) => r.column_name);

    expect(columns).toContain('id');
    expect(columns).toContain('code');
    expect(columns).toContain('type');
    expect(columns).toContain('duration_days');
    expect(columns).toContain('max_uses');
    expect(columns).toContain('current_uses');
    expect(columns).toContain('active');
    expect(columns).toContain('created_at');
  });

  it('has RLS enabled', async () => {
    // Without RLS, any user could modify promo codes directly.
    const result = await client.query(
      `SELECT relrowsecurity FROM pg_class
       WHERE relname = 'promo_codes'`
    );
    expect(result.rows[0].relrowsecurity).toBe(true);
  });

  it('allows authenticated user to SELECT promo codes', async () => {
    // Users need to read codes to check validity before redeeming.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'promo-select@test.com');

      // Insert a promo code as superuser (admin action)
      await client.query(
        `INSERT INTO promo_codes (code, type, duration_days, max_uses)
         VALUES ('TESTSELECT01', 'trial', 7, 100)`
      );

      // Switch to authenticated user
      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `SELECT code, type, duration_days FROM promo_codes WHERE code = 'TESTSELECT01'`
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].type).toBe('trial');

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('blocks authenticated user from INSERT', async () => {
    // Only admins (service_role) should create promo codes.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'promo-insert@test.com');

      await setAuthenticatedUser(client, userId);

      await expect(
        client.query(
          `INSERT INTO promo_codes (code, type, duration_days, max_uses)
           VALUES ('HACKERCODE', 'trial', 365, 999)`
        )
      ).rejects.toThrow();

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('blocks authenticated user from UPDATE', async () => {
    // Users must not be able to increase max_uses or reactivate codes.
    // RLS silently filters the UPDATE target set — no rows matched = no update.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'promo-update@test.com');

      await client.query(
        `INSERT INTO promo_codes (code, type, duration_days, max_uses, active)
         VALUES ('NOUPDATE01', 'trial', 7, 10, false)`
      );

      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `UPDATE promo_codes SET active = true WHERE code = 'NOUPDATE01'`
      );

      // RLS blocks the update silently — 0 rows affected
      expect(result.rowCount).toBe(0);

      // Verify the code is still inactive (as superuser)
      await resetToSuperuser(client);
      const check = await client.query(
        `SELECT active FROM promo_codes WHERE code = 'NOUPDATE01'`
      );
      expect(check.rows[0].active).toBe(false);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('blocks authenticated user from DELETE', async () => {
    // RLS silently filters — DELETE matches 0 rows instead of erroring.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'promo-delete@test.com');

      await client.query(
        `INSERT INTO promo_codes (code, type, duration_days, max_uses)
         VALUES ('NODELETE01', 'trial', 7, 10)`
      );

      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `DELETE FROM promo_codes WHERE code = 'NODELETE01'`
      );

      // RLS blocks the delete silently — 0 rows affected
      expect(result.rowCount).toBe(0);

      // Verify the code still exists (as superuser)
      await resetToSuperuser(client);
      const check = await client.query(
        `SELECT count(*) FROM promo_codes WHERE code = 'NODELETE01'`
      );
      expect(parseInt(check.rows[0].count)).toBe(1);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('enforces UNIQUE constraint on code', async () => {
    // Two promo codes can't have the same code string.
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO promo_codes (code, type, duration_days, max_uses)
         VALUES ('DUPECODE01', 'trial', 7, 50)`
      );

      await expect(
        client.query(
          `INSERT INTO promo_codes (code, type, duration_days, max_uses)
           VALUES ('DUPECODE01', 'discount', 30, 100)`
        )
      ).rejects.toThrow(/unique/i);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('rejects invalid type values', async () => {
    // Only 'trial' and 'discount' are allowed.
    await client.query('BEGIN');
    try {
      await expect(
        client.query(
          `INSERT INTO promo_codes (code, type, duration_days, max_uses)
           VALUES ('BADTYPE01', 'freebie', 7, 10)`
        )
      ).rejects.toThrow();

    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// user_trials table
// ===========================================================================

describe('user_trials table', () => {

  it('exists with the correct columns', async () => {
    const result = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'user_trials'
       ORDER BY ordinal_position`
    );

    const columns = result.rows.map((r) => r.column_name);

    expect(columns).toContain('id');
    expect(columns).toContain('user_id');
    expect(columns).toContain('promo_code_id');
    expect(columns).toContain('started_at');
    expect(columns).toContain('expires_at');
    expect(columns).toContain('status');
    expect(columns).toContain('created_at');
  });

  it('has RLS enabled', async () => {
    const result = await client.query(
      `SELECT relrowsecurity FROM pg_class
       WHERE relname = 'user_trials'`
    );
    expect(result.rows[0].relrowsecurity).toBe(true);
  });

  it('allows authenticated user to SELECT their own trial', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trial-select-own@test.com');

      // Insert trial as superuser (simulating service_role Edge Function)
      await client.query(
        `INSERT INTO user_trials (user_id, expires_at)
         VALUES ($1, now() + interval '7 days')`,
        [userId]
      );

      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `SELECT * FROM user_trials WHERE user_id = $1`,
        [userId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('active');

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('blocks authenticated user from reading other users trials', async () => {
    await client.query('BEGIN');
    try {
      const userA = await createTestUser(client, 'trial-owner@test.com');
      const userB = await createTestUser(client, 'trial-snooper@test.com');

      // Insert trial for user A
      await client.query(
        `INSERT INTO user_trials (user_id, expires_at)
         VALUES ($1, now() + interval '7 days')`,
        [userA]
      );

      // User B should not see user A's trial
      await setAuthenticatedUser(client, userB);

      const result = await client.query(
        `SELECT * FROM user_trials WHERE user_id = $1`,
        [userA]
      );

      expect(result.rows).toHaveLength(0);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('blocks authenticated user from INSERT', async () => {
    // Users must not be able to grant themselves trials directly.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trial-insert@test.com');

      await setAuthenticatedUser(client, userId);

      await expect(
        client.query(
          `INSERT INTO user_trials (user_id, expires_at)
           VALUES ($1, now() + interval '365 days')`,
          [userId]
        )
      ).rejects.toThrow();

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('enforces UNIQUE constraint on user_id (one trial per user)', async () => {
    // The business rule "one trial per user" is enforced at the DB level.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trial-unique@test.com');

      // First trial succeeds
      await client.query(
        `INSERT INTO user_trials (user_id, expires_at)
         VALUES ($1, now() + interval '7 days')`,
        [userId]
      );

      // Second trial for same user fails
      await expect(
        client.query(
          `INSERT INTO user_trials (user_id, expires_at)
           VALUES ($1, now() + interval '7 days')`,
          [userId]
        )
      ).rejects.toThrow(/unique/i);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('cascades deletion when the profile is deleted', async () => {
    // Account deletion should clean up trial records.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trial-cascade@test.com');

      await client.query(
        `INSERT INTO user_trials (user_id, expires_at)
         VALUES ($1, now() + interval '7 days')`,
        [userId]
      );

      // Verify trial exists
      const before = await client.query(
        `SELECT count(*) FROM user_trials WHERE user_id = $1`,
        [userId]
      );
      expect(parseInt(before.rows[0].count)).toBe(1);

      // Delete the auth user — cascades to profiles → user_trials
      await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);

      const after = await client.query(
        `SELECT count(*) FROM user_trials WHERE user_id = $1`,
        [userId]
      );
      expect(parseInt(after.rows[0].count)).toBe(0);

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('rejects invalid status values', async () => {
    // Only 'active' and 'expired' are allowed.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'trial-badstatus@test.com');

      await expect(
        client.query(
          `INSERT INTO user_trials (user_id, expires_at, status)
           VALUES ($1, now() + interval '7 days', 'cancelled')`,
          [userId]
        )
      ).rejects.toThrow();

    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// expire_trials() function
// ===========================================================================

describe('expire_trials()', () => {

  it('expires past-due active trials', async () => {
    // A trial whose expires_at is in the past should be marked 'expired'.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'expire-past@test.com');

      // Insert a trial that expired yesterday
      await client.query(
        `INSERT INTO user_trials (user_id, expires_at, status)
         VALUES ($1, now() - interval '1 day', 'active')`,
        [userId]
      );

      // Run the expiration function
      await client.query('SELECT expire_trials()');

      const result = await client.query(
        `SELECT status FROM user_trials WHERE user_id = $1`,
        [userId]
      );

      expect(result.rows[0].status).toBe('expired');

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('skips future-dated trials (not yet expired)', async () => {
    // A trial that hasn't expired yet should remain 'active'.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'expire-future@test.com');

      await client.query(
        `INSERT INTO user_trials (user_id, expires_at, status)
         VALUES ($1, now() + interval '5 days', 'active')`,
        [userId]
      );

      await client.query('SELECT expire_trials()');

      const result = await client.query(
        `SELECT status FROM user_trials WHERE user_id = $1`,
        [userId]
      );

      expect(result.rows[0].status).toBe('active');

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('reverts tier to free when trial expires (no active subscription)', async () => {
    // If the user was on a trial (tier = 'pro') and has no paid subscription,
    // their tier should revert to 'free' when the trial expires.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'expire-revert@test.com');

      // Set user to pro (simulating the redeem-promo Edge Function)
      await client.query(
        `UPDATE profiles SET tier = 'pro' WHERE id = $1`,
        [userId]
      );

      // Insert expired trial
      await client.query(
        `INSERT INTO user_trials (user_id, expires_at, status)
         VALUES ($1, now() - interval '1 day', 'active')`,
        [userId]
      );

      await client.query('SELECT expire_trials()');

      const result = await client.query(
        `SELECT tier FROM profiles WHERE id = $1`,
        [userId]
      );

      expect(result.rows[0].tier).toBe('free');

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('keeps tier pro when user has an active paid subscription', async () => {
    // A user who started a trial and then subscribed should keep 'pro'
    // even after the trial expires — the paid subscription is still active.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'expire-paid@test.com');

      // Set user to pro
      await client.query(
        `UPDATE profiles SET tier = 'pro' WHERE id = $1`,
        [userId]
      );

      // Insert expired trial
      await client.query(
        `INSERT INTO user_trials (user_id, expires_at, status)
         VALUES ($1, now() - interval '1 day', 'active')`,
        [userId]
      );

      // Also has an active paid subscription (expires in the future)
      await client.query(
        `INSERT INTO subscription_events (user_id, event_type, store, store_transaction_id, store_product_id, expires_at)
         VALUES ($1, 'purchase', 'apple', 'txn-keep-pro-001', 'com.betabreaker.pro.monthly', now() + interval '25 days')`,
        [userId]
      );

      await client.query('SELECT expire_trials()');

      // Trial should be expired, but tier should remain 'pro'
      const trialResult = await client.query(
        `SELECT status FROM user_trials WHERE user_id = $1`,
        [userId]
      );
      expect(trialResult.rows[0].status).toBe('expired');

      const profileResult = await client.query(
        `SELECT tier FROM profiles WHERE id = $1`,
        [userId]
      );
      expect(profileResult.rows[0].tier).toBe('pro');

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('handles batch expiration (multiple users)', async () => {
    // The cron job should expire all past-due trials in a single run,
    // not just the first one it finds.
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'batch-expire-1@test.com');
      const user2 = await createTestUser(client, 'batch-expire-2@test.com');
      const user3 = await createTestUser(client, 'batch-expire-3@test.com');

      // All three have expired trials
      for (const uid of [user1, user2, user3]) {
        await client.query(
          `UPDATE profiles SET tier = 'pro' WHERE id = $1`,
          [uid]
        );
        await client.query(
          `INSERT INTO user_trials (user_id, expires_at, status)
           VALUES ($1, now() - interval '2 days', 'active')`,
          [uid]
        );
      }

      await client.query('SELECT expire_trials()');

      // All three should be expired and reverted to free
      const result = await client.query(
        `SELECT ut.status, p.tier
         FROM user_trials ut
         JOIN profiles p ON p.id = ut.user_id
         WHERE ut.user_id IN ($1, $2, $3)
         ORDER BY p.created_at`,
        [user1, user2, user3]
      );

      expect(result.rows).toHaveLength(3);
      for (const row of result.rows) {
        expect(row.status).toBe('expired');
        expect(row.tier).toBe('free');
      }

    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('is idempotent (double call does not error)', async () => {
    // Calling expire_trials() twice should not fail or produce incorrect
    // results — the second call simply finds no active expired trials.
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'expire-idempotent@test.com');

      await client.query(
        `UPDATE profiles SET tier = 'pro' WHERE id = $1`,
        [userId]
      );

      await client.query(
        `INSERT INTO user_trials (user_id, expires_at, status)
         VALUES ($1, now() - interval '1 day', 'active')`,
        [userId]
      );

      // First call — expires the trial
      await client.query('SELECT expire_trials()');

      // Second call — no-op, should not error
      await expect(
        client.query('SELECT expire_trials()')
      ).resolves.not.toThrow();

      // Still expired, still free
      const result = await client.query(
        `SELECT ut.status, p.tier
         FROM user_trials ut
         JOIN profiles p ON p.id = ut.user_id
         WHERE ut.user_id = $1`,
        [userId]
      );

      expect(result.rows[0].status).toBe('expired');
      expect(result.rows[0].tier).toBe('free');

    } finally {
      await client.query('ROLLBACK');
    }
  });
});
