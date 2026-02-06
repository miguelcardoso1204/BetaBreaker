/**
 * Integration tests for notifications & saved routes tables (Step 2.7).
 *
 * These tests verify:
 *   - 4 new tables: notifications, push_tokens, notification_preferences, saved_routes
 *   - RLS enabled on all 4 tables
 *   - 14 RLS policies controlling access (all user-scoped — no role-based access)
 *   - CHECK constraints (notification type, platform, category, save_type)
 *   - UNIQUE constraints (push_tokens, notification_preferences, saved_routes)
 *   - CASCADE deletes (user deletion and route deletion cascade properly)
 *
 * Why notifications & saved routes?
 * ─────────────────────────────────
 * Users need in-app notifications for social events (friend requests, badge
 * earned, competition updates) and push tokens to receive mobile push
 * notifications. Saved routes let climbers bookmark routes as projects,
 * wishlists, or favorites (FR-C4). This migration supports:
 *   - FR-J1: In-app notification display
 *   - FR-J2: Notification types and deep-linking
 *   - FR-J3: Per-category notification opt-out preferences
 *   - FR-C4: Route bookmarking with save_type categories
 *
 * Prerequisites:
 * - Local Supabase must be running: `npx supabase start`
 * - All 7 migrations applied: `npx supabase db reset`
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

// ===========================================================================
// Test Suite: Tables exist
// ===========================================================================

/**
 * Verify that all 4 notification/saved route tables were created by the migration.
 * We query information_schema.tables — the standard SQL metadata catalog.
 */
describe('Notification & saved route tables exist', () => {
  it.each([
    'notifications',
    'push_tokens',
    'notification_preferences',
    'saved_routes',
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
 * Verify that Row Level Security is enabled on all 4 tables.
 * With RLS enabled but no policies, only superusers can access data.
 * The migration adds policies to grant controlled access.
 */
describe('RLS enabled on notification & saved route tables', () => {
  it.each([
    'notifications',
    'push_tokens',
    'notification_preferences',
    'saved_routes',
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
// Test Suite: notifications
// ===========================================================================

/**
 * The notifications table stores in-app notification history (FR-J1, FR-J2).
 * Each row is a system-generated notification delivered to a specific user.
 * The type column categorizes notifications for filtering and display.
 */
describe('notifications', () => {
  it('can insert a notification with defaults', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'notif-insert@test.com');

      // Insert a notification — data defaults to '{}', read defaults to false
      const result = await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'badge_earned', 'New Badge!', 'You earned the Summit Seeker badge.')
         RETURNING id, data, read, created_at`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].data).toEqual({});       // JSONB default
      expect(result.rows[0].read).toBe(false);        // boolean default
      expect(result.rows[0].created_at).toBeTruthy(); // timestamp set
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('read defaults to false', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'notif-read-default@test.com');

      const result = await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'general', 'Welcome!', 'Thanks for joining.')
         RETURNING read`,
        [userId]
      );
      // New notifications should be unread by default
      expect(result.rows[0].read).toBe(false);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('type CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'notif-bad-type@test.com');

      // 'promo_offer' is not a valid notification type
      await expect(
        client.query(
          `INSERT INTO notifications (user_id, type, title, body)
           VALUES ($1, 'promo_offer', 'Sale!', '50% off chalk bags.')`,
          [userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('all valid notification types accepted', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'notif-all-types@test.com');

      // Test all 6 valid notification types
      const validTypes = [
        'friend_send', 'route_retirement', 'comp_update',
        'rank_change', 'badge_earned', 'general',
      ];
      for (const type of validTypes) {
        const result = await client.query(
          `INSERT INTO notifications (user_id, type, title, body)
           VALUES ($1, $2, $3, 'Test body')
           RETURNING type`,
          [userId, type, `Test ${type}`]
        );
        expect(result.rows[0].type).toBe(type);
      }
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('CASCADE: notifications deleted when user is deleted', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'notif-cascade@test.com');

      // Insert a notification for this user
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'general', 'Doomed', 'This will be cascade-deleted.')`,
        [userId]
      );

      // Delete the auth.users row — cascades to profiles → notifications
      await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);

      const remaining = await client.query(
        'SELECT id FROM notifications WHERE user_id = $1',
        [userId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: push_tokens
// ===========================================================================

/**
 * push_tokens stores Expo push notification tokens for each device.
 * The UNIQUE(user_id, token) constraint prevents duplicate registrations.
 * The platform CHECK constraint limits values to 'ios' and 'android'.
 */
describe('push_tokens', () => {
  it('can insert a push token', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'push-insert@test.com');

      const result = await client.query(
        `INSERT INTO push_tokens (user_id, token, platform)
         VALUES ($1, 'ExponentPushToken[abc123]', 'ios')
         RETURNING id, token, platform`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].token).toBe('ExponentPushToken[abc123]');
      expect(result.rows[0].platform).toBe('ios');
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('platform CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'push-bad-platform@test.com');

      // 'web' is not a valid platform — only 'ios' and 'android'
      await expect(
        client.query(
          `INSERT INTO push_tokens (user_id, token, platform)
           VALUES ($1, 'token123', 'web')`,
          [userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('UNIQUE(user_id, token) prevents duplicate registration', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'push-dup@test.com');

      // First registration succeeds
      await client.query(
        `INSERT INTO push_tokens (user_id, token, platform)
         VALUES ($1, 'ExponentPushToken[dup]', 'android')`,
        [userId]
      );

      // Same user + same token — UNIQUE violation
      await expect(
        client.query(
          `INSERT INTO push_tokens (user_id, token, platform)
           VALUES ($1, 'ExponentPushToken[dup]', 'android')`,
          [userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('multiple tokens per user allowed (different devices)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'push-multi@test.com');

      // Phone token
      await client.query(
        `INSERT INTO push_tokens (user_id, token, platform)
         VALUES ($1, 'ExponentPushToken[phone]', 'ios')`,
        [userId]
      );

      // Tablet token — different token, same user — should succeed
      const result = await client.query(
        `INSERT INTO push_tokens (user_id, token, platform)
         VALUES ($1, 'ExponentPushToken[tablet]', 'ios')
         RETURNING id`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);

      // Verify both tokens exist
      const all = await client.query(
        'SELECT id FROM push_tokens WHERE user_id = $1',
        [userId]
      );
      expect(all.rows).toHaveLength(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: notification_preferences
// ===========================================================================

/**
 * notification_preferences stores per-category opt-out settings (FR-J3).
 * The opt-out model means no row = enabled. UNIQUE(user_id, category)
 * prevents conflicting preferences for the same category.
 */
describe('notification_preferences', () => {
  it('can insert a preference', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'pref-insert@test.com');

      const result = await client.query(
        `INSERT INTO notification_preferences (user_id, category)
         VALUES ($1, 'friends')
         RETURNING id, category, enabled`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].category).toBe('friends');
      // enabled defaults to true (opt-out model — must explicitly disable)
      expect(result.rows[0].enabled).toBe(true);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('enabled defaults to true', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'pref-default@test.com');

      const result = await client.query(
        `INSERT INTO notification_preferences (user_id, category)
         VALUES ($1, 'comps')
         RETURNING enabled`,
        [userId]
      );
      // Opt-out model: default is enabled. Users toggle to false to mute.
      expect(result.rows[0].enabled).toBe(true);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('category CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'pref-bad-cat@test.com');

      // 'marketing' is not a valid category
      await expect(
        client.query(
          `INSERT INTO notification_preferences (user_id, category)
           VALUES ($1, 'marketing')`,
          [userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('UNIQUE(user_id, category) prevents duplicate preferences', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'pref-dup@test.com');

      // First preference for 'routes'
      await client.query(
        `INSERT INTO notification_preferences (user_id, category, enabled)
         VALUES ($1, 'routes', false)`,
        [userId]
      );

      // Same user + same category — UNIQUE violation
      await expect(
        client.query(
          `INSERT INTO notification_preferences (user_id, category, enabled)
           VALUES ($1, 'routes', true)`,
          [userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('all valid categories accepted', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'pref-all-cats@test.com');

      // Test all 4 valid categories
      const validCategories = ['friends', 'routes', 'comps', 'achievements'];
      for (const category of validCategories) {
        const result = await client.query(
          `INSERT INTO notification_preferences (user_id, category)
           VALUES ($1, $2)
           RETURNING category`,
          [userId, category]
        );
        expect(result.rows[0].category).toBe(category);
      }
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: saved_routes
// ===========================================================================

/**
 * saved_routes lets climbers bookmark routes as projects, wishlists, or
 * favorites (FR-C4). UNIQUE(user_id, route_id, save_type) prevents
 * duplicate bookmarks within the same type, but the same route can
 * appear under multiple types.
 */
describe('saved_routes', () => {
  it('can insert a saved route', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'saved-insert@test.com');
      const gymId = await createTestGym(client, 'Saved Route Gym');
      const routeId = await createTestRoute(client, gymId, 15);

      const result = await client.query(
        `INSERT INTO saved_routes (user_id, route_id, save_type)
         VALUES ($1, $2, 'project')
         RETURNING id, save_type, created_at`,
        [userId, routeId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].save_type).toBe('project');
      expect(result.rows[0].created_at).toBeTruthy();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('all save_type values accepted', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'saved-all-types@test.com');
      const gymId = await createTestGym(client, 'All Types Gym');

      // Test all 3 valid save types — each with a different route
      const validTypes = ['project', 'wishlist', 'favorite'];
      for (let i = 0; i < validTypes.length; i++) {
        const routeId = await createTestRoute(client, gymId, 10 + i);
        const result = await client.query(
          `INSERT INTO saved_routes (user_id, route_id, save_type)
           VALUES ($1, $2, $3)
           RETURNING save_type`,
          [userId, routeId, validTypes[i]]
        );
        expect(result.rows[0].save_type).toBe(validTypes[i]);
      }
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('save_type CHECK rejects invalid values', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'saved-bad-type@test.com');
      const gymId = await createTestGym(client, 'Bad Type Gym');
      const routeId = await createTestRoute(client, gymId, 8);

      // 'bookmark' is not a valid save_type — only project, wishlist, favorite
      await expect(
        client.query(
          `INSERT INTO saved_routes (user_id, route_id, save_type)
           VALUES ($1, $2, 'bookmark')`,
          [userId, routeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('UNIQUE(user_id, route_id, save_type) prevents duplicate bookmarks', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'saved-dup@test.com');
      const gymId = await createTestGym(client, 'Dup Saved Gym');
      const routeId = await createTestRoute(client, gymId, 12);

      // First bookmark as 'project'
      await client.query(
        `INSERT INTO saved_routes (user_id, route_id, save_type)
         VALUES ($1, $2, 'project')`,
        [userId, routeId]
      );

      // Same user + same route + same type — UNIQUE violation
      await expect(
        client.query(
          `INSERT INTO saved_routes (user_id, route_id, save_type)
           VALUES ($1, $2, 'project')`,
          [userId, routeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('same route can be saved under multiple types', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'saved-multi-type@test.com');
      const gymId = await createTestGym(client, 'Multi Type Gym');
      const routeId = await createTestRoute(client, gymId, 18);

      // Save as 'project'
      await client.query(
        `INSERT INTO saved_routes (user_id, route_id, save_type)
         VALUES ($1, $2, 'project')`,
        [userId, routeId]
      );

      // Save same route as 'favorite' — different save_type, so UNIQUE allows it
      const result = await client.query(
        `INSERT INTO saved_routes (user_id, route_id, save_type)
         VALUES ($1, $2, 'favorite')
         RETURNING id`,
        [userId, routeId]
      );
      expect(result.rows).toHaveLength(1);

      // Verify both bookmarks exist
      const all = await client.query(
        'SELECT id FROM saved_routes WHERE user_id = $1 AND route_id = $2',
        [userId, routeId]
      );
      expect(all.rows).toHaveLength(2);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: saved_routes CASCADE
// ===========================================================================

/**
 * saved_routes has two CASCADE paths: user deletion and route deletion.
 * Both must clean up saved_routes rows to prevent orphaned data.
 */
describe('saved_routes CASCADE', () => {
  it('saved_routes deleted when route is deleted', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'saved-route-cascade@test.com');
      const gymId = await createTestGym(client, 'Route Cascade Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      await client.query(
        `INSERT INTO saved_routes (user_id, route_id, save_type)
         VALUES ($1, $2, 'wishlist')`,
        [userId, routeId]
      );

      // Delete the route — CASCADE should remove the saved_routes row
      await client.query('DELETE FROM routes WHERE id = $1', [routeId]);

      const remaining = await client.query(
        'SELECT id FROM saved_routes WHERE route_id = $1',
        [routeId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('saved_routes deleted when user is deleted', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'saved-user-cascade@test.com');
      const gymId = await createTestGym(client, 'User Cascade Gym');
      const routeId = await createTestRoute(client, gymId, 14);

      await client.query(
        `INSERT INTO saved_routes (user_id, route_id, save_type)
         VALUES ($1, $2, 'favorite')`,
        [userId, routeId]
      );

      // Delete the auth.users row — cascades to profiles → saved_routes
      await client.query('DELETE FROM auth.users WHERE id = $1', [userId]);

      const remaining = await client.query(
        'SELECT id FROM saved_routes WHERE user_id = $1',
        [userId]
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: RLS policies — notifications
// ===========================================================================

/**
 * Behavioral tests for the 3 RLS policies on notifications.
 * Key design: users can SELECT their own and UPDATE (mark as read),
 * but cannot INSERT (system-only) or DELETE (permanent history log).
 */
describe('RLS: notifications', () => {
  it('user can read own notifications', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-notif-read@test.com');

      // Insert a notification as superuser (simulating system insert)
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'badge_earned', 'Achievement!', 'You earned a badge.')`,
        [userId]
      );

      // Switch to the user — should see their own notification
      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `SELECT title FROM notifications WHERE user_id = $1`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].title).toBe('Achievement!');

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user cannot read another user\'s notifications (cross-user blocked)', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'rls-notif-owner@test.com');
      const user2 = await createTestUser(client, 'rls-notif-snooper@test.com');

      // Insert a notification for user1
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'friend_send', 'Friend Request', 'Someone wants to follow you.')`,
        [user1]
      );

      // Switch to user2 — should NOT see user1's notification
      await setAuthenticatedUser(client, user2);

      const result = await client.query(
        `SELECT title FROM notifications WHERE user_id = $1`,
        [user1]
      );
      // RLS USING clause filters out — returns 0 rows (not an error)
      expect(result.rows).toHaveLength(0);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user can mark own notification as read (UPDATE)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-notif-update@test.com');

      // Insert an unread notification as superuser
      const insertResult = await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'rank_change', 'Rank Up!', 'You moved up on the leaderboard.')
         RETURNING id`,
        [userId]
      );
      const notifId = insertResult.rows[0].id;

      // Switch to the user and mark as read
      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `UPDATE notifications SET read = true WHERE id = $1 RETURNING read`,
        [notifId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].read).toBe(true);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user cannot update another user\'s notification (cross-user blocked)', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'rls-notif-update-owner@test.com');
      const user2 = await createTestUser(client, 'rls-notif-update-snooper@test.com');

      // Insert a notification for user1
      const insertResult = await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'comp_update', 'Comp Started', 'The spring comp is now open.')
         RETURNING id`,
        [user1]
      );
      const notifId = insertResult.rows[0].id;

      // Switch to user2 — try to mark user1's notification as read
      await setAuthenticatedUser(client, user2);

      const result = await client.query(
        `UPDATE notifications SET read = true WHERE id = $1`,
        [notifId]
      );
      // RLS USING clause filters out — UPDATE sees 0 matching rows
      expect(result.rowCount).toBe(0);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('authenticated user cannot INSERT notifications (system-only)', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-notif-no-insert@test.com');

      // Switch to authenticated user
      await setAuthenticatedUser(client, userId);

      // Try to create a notification — should fail (no INSERT policy)
      await expect(
        client.query(
          `INSERT INTO notifications (user_id, type, title, body)
           VALUES ($1, 'general', 'Self-notif', 'I notified myself.')`,
          [userId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: RLS policies — push_tokens
// ===========================================================================

/**
 * Behavioral tests for the 3 RLS policies on push_tokens.
 * Users can register (INSERT), view (SELECT), and remove (DELETE) their
 * own push tokens. They cannot see or modify other users' tokens.
 */
describe('RLS: push_tokens', () => {
  it('user can insert own push token', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-push-insert@test.com');

      // Switch to authenticated user
      await setAuthenticatedUser(client, userId);

      // Register a push token — should succeed (user_id = auth.uid())
      const result = await client.query(
        `INSERT INTO push_tokens (user_id, token, platform)
         VALUES ($1, 'ExponentPushToken[mydevice]', 'android')
         RETURNING id`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user cannot insert push token for another user (cross-user blocked)', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'rls-push-spoofer@test.com');
      const user2 = await createTestUser(client, 'rls-push-victim@test.com');

      // Switch to user1
      await setAuthenticatedUser(client, user1);

      // Try to register a token for user2 — should fail
      await expect(
        client.query(
          `INSERT INTO push_tokens (user_id, token, platform)
           VALUES ($1, 'ExponentPushToken[stolen]', 'ios')`,
          [user2]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user can delete own push token', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-push-delete@test.com');

      // Insert a token as superuser
      const insertResult = await client.query(
        `INSERT INTO push_tokens (user_id, token, platform)
         VALUES ($1, 'ExponentPushToken[logout]', 'ios')
         RETURNING id`,
        [userId]
      );
      const tokenId = insertResult.rows[0].id;

      // Switch to the user and delete the token (simulating logout)
      await setAuthenticatedUser(client, userId);

      const deleteResult = await client.query(
        `DELETE FROM push_tokens WHERE id = $1`,
        [tokenId]
      );
      expect(deleteResult.rowCount).toBe(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: RLS policies — notification_preferences
// ===========================================================================

/**
 * Behavioral tests for the 4 RLS policies on notification_preferences.
 * Users have full CRUD on their own preferences. They cannot see or
 * modify other users' preferences.
 */
describe('RLS: notification_preferences', () => {
  it('user can insert own preference', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-pref-insert@test.com');

      // Switch to authenticated user
      await setAuthenticatedUser(client, userId);

      // Create a preference — should succeed (user_id = auth.uid())
      const result = await client.query(
        `INSERT INTO notification_preferences (user_id, category, enabled)
         VALUES ($1, 'achievements', false)
         RETURNING category, enabled`,
        [userId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].category).toBe('achievements');
      expect(result.rows[0].enabled).toBe(false);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user can update own preference', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-pref-update@test.com');

      // Insert a preference as superuser (enabled = true)
      const insertResult = await client.query(
        `INSERT INTO notification_preferences (user_id, category, enabled)
         VALUES ($1, 'friends', true)
         RETURNING id`,
        [userId]
      );
      const prefId = insertResult.rows[0].id;

      // Switch to the user and toggle the preference off
      await setAuthenticatedUser(client, userId);

      const result = await client.query(
        `UPDATE notification_preferences SET enabled = false
         WHERE id = $1
         RETURNING enabled`,
        [prefId]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].enabled).toBe(false);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user cannot read another user\'s preferences (cross-user blocked)', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'rls-pref-owner@test.com');
      const user2 = await createTestUser(client, 'rls-pref-snooper@test.com');

      // Insert a preference for user1
      await client.query(
        `INSERT INTO notification_preferences (user_id, category, enabled)
         VALUES ($1, 'comps', false)`,
        [user1]
      );

      // Switch to user2 — should NOT see user1's preference
      await setAuthenticatedUser(client, user2);

      const result = await client.query(
        `SELECT * FROM notification_preferences WHERE user_id = $1`,
        [user1]
      );
      // RLS filters out — 0 rows returned
      expect(result.rows).toHaveLength(0);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// ===========================================================================
// Test Suite: RLS policies — saved_routes
// ===========================================================================

/**
 * Behavioral tests for the 4 RLS policies on saved_routes.
 * Users have full CRUD on their own saved routes. They cannot see or
 * modify other users' bookmarks.
 */
describe('RLS: saved_routes', () => {
  it('user can insert own saved route', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-saved-insert@test.com');
      const gymId = await createTestGym(client, 'RLS Saved Insert Gym');
      const routeId = await createTestRoute(client, gymId, 12);

      // Switch to authenticated user
      await setAuthenticatedUser(client, userId);

      // Save a route — should succeed (user_id = auth.uid())
      const result = await client.query(
        `INSERT INTO saved_routes (user_id, route_id, save_type)
         VALUES ($1, $2, 'project')
         RETURNING id`,
        [userId, routeId]
      );
      expect(result.rows).toHaveLength(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user cannot insert saved route for another user (cross-user blocked)', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'rls-saved-spoofer@test.com');
      const user2 = await createTestUser(client, 'rls-saved-victim@test.com');
      const gymId = await createTestGym(client, 'RLS Saved Spoof Gym');
      const routeId = await createTestRoute(client, gymId, 10);

      // Switch to user1
      await setAuthenticatedUser(client, user1);

      // Try to save a route for user2 — should fail
      await expect(
        client.query(
          `INSERT INTO saved_routes (user_id, route_id, save_type)
           VALUES ($1, $2, 'wishlist')`,
          [user2, routeId]
        )
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user can only see own saved routes (cross-user filtered)', async () => {
    await client.query('BEGIN');
    try {
      const user1 = await createTestUser(client, 'rls-saved-see-owner@test.com');
      const user2 = await createTestUser(client, 'rls-saved-see-other@test.com');
      const gymId = await createTestGym(client, 'RLS Saved See Gym');
      const routeId = await createTestRoute(client, gymId, 14);

      // Save a route for user1 as superuser
      await client.query(
        `INSERT INTO saved_routes (user_id, route_id, save_type)
         VALUES ($1, $2, 'favorite')`,
        [user1, routeId]
      );

      // Switch to user2 — should NOT see user1's saved route
      await setAuthenticatedUser(client, user2);

      const result = await client.query(
        `SELECT * FROM saved_routes WHERE user_id = $1`,
        [user1]
      );
      // RLS filters out — 0 rows returned
      expect(result.rows).toHaveLength(0);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('user can delete own saved route', async () => {
    await client.query('BEGIN');
    try {
      const userId = await createTestUser(client, 'rls-saved-delete@test.com');
      const gymId = await createTestGym(client, 'RLS Saved Delete Gym');
      const routeId = await createTestRoute(client, gymId, 8);

      // Insert a saved route as superuser
      const insertResult = await client.query(
        `INSERT INTO saved_routes (user_id, route_id, save_type)
         VALUES ($1, $2, 'wishlist')
         RETURNING id`,
        [userId, routeId]
      );
      const savedId = insertResult.rows[0].id;

      // Switch to the user and unsave the route
      await setAuthenticatedUser(client, userId);

      const deleteResult = await client.query(
        `DELETE FROM saved_routes WHERE id = $1`,
        [savedId]
      );
      expect(deleteResult.rowCount).toBe(1);

      await resetToSuperuser(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
