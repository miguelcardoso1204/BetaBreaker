/**
 * Integration tests for the dispatch-push Edge Function (Step 10.2).
 *
 * These tests call the actual Edge Function via HTTP, verifying:
 *   - Notification row creation in the database
 *   - Push preference opt-out behavior
 *   - Token lookup and push reporting
 *   - Service-role authorization
 *   - Input validation
 *
 * TEST ISOLATION:
 * Like the sign-qr tests (00010), these use PERSISTENT data because the
 * Edge Function makes its own DB connection — it can't see rows inside
 * our test transaction. We create data in beforeAll, clean up in afterAll.
 *
 * AUTH MODEL:
 * Unlike sign-qr (user JWT auth), dispatch-push uses service-role auth.
 * We pass the well-known local service_role key as a Bearer token.
 *
 * PREREQUISITES:
 * - Local Supabase running: `npx supabase start`
 * - Edge Functions serving: `npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local`
 * - Database has been reset: `npx supabase db reset`
 */

import { Client } from 'pg';

// ── Constants ────────────────────────────────────────────────────────
// Well-known values for the local Supabase development instance.

/** Local Supabase API URL — all services are exposed through this gateway. */
const API_URL = 'http://127.0.0.1:54321';

/**
 * Local Supabase service_role key — a well-known, non-secret key used
 * for local development. This key bypasses RLS and has full DB access.
 * dispatch-push validates that the caller sends this key as a Bearer token.
 */
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/**
 * Local Supabase anon key — needed for the apikey header on function calls.
 */
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/** Direct URL to the dispatch-push Edge Function. */
const FUNCTION_URL = `${API_URL}/functions/v1/dispatch-push`;

/** Postgres connection string for direct DB access (setup/cleanup/verification). */
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// ── Test data IDs ────────────────────────────────────────────────────
// Fixed UUIDs distinct from seed data and other test suites to avoid conflicts.

const TEST_USER_WITH_TOKEN_ID = 'f0000000-0000-0000-0000-000000000130';
const TEST_USER_NO_TOKEN_ID = 'f0000000-0000-0000-0000-000000000131';

const TEST_USER_WITH_TOKEN_EMAIL = 'push-user-with-token@test.local';
const TEST_USER_NO_TOKEN_EMAIL = 'push-user-no-token@test.local';
const TEST_PASSWORD = 'password123';

// ── Shared state ─────────────────────────────────────────────────────

let client: Client;

// Track notification IDs created during tests for cleanup
const createdNotificationIds: string[] = [];

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Call the dispatch-push Edge Function with the given auth and body.
 * Returns the raw Response for flexible assertion in tests.
 *
 * @param authToken - Bearer token to send. Use SERVICE_ROLE_KEY for valid auth,
 *                    null for no auth, or any string for invalid auth.
 * @param body - Request payload (user_id, type, title, body, data?)
 */
async function callDispatchPush(
  authToken: string | null,
  body: Record<string, unknown>
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ── Setup / Teardown ─────────────────────────────────────────────────

beforeAll(async () => {
  // Connect directly to Postgres to create test data that the Edge Function
  // can see (it has its own DB connection, not inside our transaction).
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // 1. Create user WITH a push token
  await client.query(`
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_user_meta_data,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      $1, 'authenticated', 'authenticated', $2,
      extensions.crypt($3, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"display_name": "Push User With Token"}'::jsonb,
      '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING
  `, [TEST_USER_WITH_TOKEN_ID, TEST_USER_WITH_TOKEN_EMAIL, TEST_PASSWORD]);

  // Ensure profile exists (handle_new_user trigger should have created it,
  // but ON CONFLICT guards against reruns)
  await client.query(`
    INSERT INTO public.profiles (id, display_name)
    VALUES ($1, 'Push User With Token')
    ON CONFLICT (id) DO NOTHING
  `, [TEST_USER_WITH_TOKEN_ID]);

  // 2. Register a push token for that user
  await client.query(`
    INSERT INTO public.push_tokens (user_id, token, platform)
    VALUES ($1, 'ExponentPushToken[test-dispatch-push-001]', 'android')
    ON CONFLICT (user_id, token) DO NOTHING
  `, [TEST_USER_WITH_TOKEN_ID]);

  // 3. Set a notification preference: opt OUT of "friends" category
  await client.query(`
    INSERT INTO public.notification_preferences (user_id, category, enabled)
    VALUES ($1, 'friends', false)
    ON CONFLICT (user_id, category) DO UPDATE SET enabled = false
  `, [TEST_USER_WITH_TOKEN_ID]);

  // 4. Create user WITHOUT a push token (profile only, no push_tokens row)
  await client.query(`
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_user_meta_data,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      $1, 'authenticated', 'authenticated', $2,
      extensions.crypt($3, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"display_name": "Push User No Token"}'::jsonb,
      '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING
  `, [TEST_USER_NO_TOKEN_ID, TEST_USER_NO_TOKEN_EMAIL, TEST_PASSWORD]);

  await client.query(`
    INSERT INTO public.profiles (id, display_name)
    VALUES ($1, 'Push User No Token')
    ON CONFLICT (id) DO NOTHING
  `, [TEST_USER_NO_TOKEN_ID]);
}, 30000);

afterAll(async () => {
  // Clean up notifications created during tests (not cascade-deleted by user deletion
  // if they reference a user that's already gone, but let's be thorough)
  if (createdNotificationIds.length > 0) {
    await client.query(
      `DELETE FROM public.notifications WHERE id = ANY($1::uuid[])`,
      [createdNotificationIds]
    );
  }

  // CASCADE on auth.users handles profiles, push_tokens, notification_preferences,
  // and any remaining notifications
  await client.query('DELETE FROM auth.users WHERE id = $1', [TEST_USER_WITH_TOKEN_ID]);
  await client.query('DELETE FROM auth.users WHERE id = $1', [TEST_USER_NO_TOKEN_ID]);
  await client.end();
});

// ── Tests ────────────────────────────────────────────────────────────

describe('dispatch-push Edge Function', () => {
  it('creates a notification row in the database', async () => {
    // A valid request should persist a notification row regardless of push outcome.
    const res = await callDispatchPush(SERVICE_ROLE_KEY, {
      user_id: TEST_USER_WITH_TOKEN_ID,
      type: 'badge_earned',
      title: 'New Badge!',
      body: 'You earned the First Flash badge.',
      data: { badge_id: 'test-badge-123' },
    });

    expect(res.status).toBe(200);
    const result = await res.json();
    createdNotificationIds.push(result.notification_id);

    // Verify the row exists in the database with correct values
    const { rows } = await client.query(
      `SELECT id, user_id, type, title, body, data, read
       FROM public.notifications WHERE id = $1`,
      [result.notification_id]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(TEST_USER_WITH_TOKEN_ID);
    expect(rows[0].type).toBe('badge_earned');
    expect(rows[0].title).toBe('New Badge!');
    expect(rows[0].body).toBe('You earned the First Flash badge.');
    expect(rows[0].data).toEqual({ badge_id: 'test-badge-123' });
    expect(rows[0].read).toBe(false); // Default: unread
  });

  it('returns a valid notification_id UUID in the response', async () => {
    const res = await callDispatchPush(SERVICE_ROLE_KEY, {
      user_id: TEST_USER_WITH_TOKEN_ID,
      type: 'general',
      title: 'System Update',
      body: 'We released a new version.',
    });

    expect(res.status).toBe(200);
    const result = await res.json();
    createdNotificationIds.push(result.notification_id);

    // UUID v4 format: 8-4-4-4-12 hex characters
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(result.notification_id).toMatch(uuidRegex);
  });

  it('reports push attempted when user has tokens and is opted in', async () => {
    // badge_earned maps to "achievements" category — user hasn't opted out of that,
    // and has a push token registered. Push should be attempted.
    const res = await callDispatchPush(SERVICE_ROLE_KEY, {
      user_id: TEST_USER_WITH_TOKEN_ID,
      type: 'badge_earned',
      title: 'Achievement Unlocked',
      body: 'You earned a new badge!',
    });

    expect(res.status).toBe(200);
    const result = await res.json();
    createdNotificationIds.push(result.notification_id);

    expect(result.pushed).toBe(true);
    expect(result.token_count).toBe(1);
  });

  it('skips push when user opted out of the category', async () => {
    // friend_send maps to "friends" category — user opted out in beforeAll.
    // Notification should still be created, but push should be skipped.
    const res = await callDispatchPush(SERVICE_ROLE_KEY, {
      user_id: TEST_USER_WITH_TOKEN_ID,
      type: 'friend_send',
      title: 'New Follower',
      body: 'Someone wants to follow you.',
    });

    expect(res.status).toBe(200);
    const result = await res.json();
    createdNotificationIds.push(result.notification_id);

    expect(result.pushed).toBe(false);
    expect(result.reason).toBe('opted_out');

    // But the notification row should still exist in the database
    const { rows } = await client.query(
      `SELECT id FROM public.notifications WHERE id = $1`,
      [result.notification_id]
    );
    expect(rows).toHaveLength(1);
  });

  it('reports no push when user has no tokens', async () => {
    // The second test user has no push tokens registered.
    // Notification is created, but push can't be delivered.
    const res = await callDispatchPush(SERVICE_ROLE_KEY, {
      user_id: TEST_USER_NO_TOKEN_ID,
      type: 'general',
      title: 'Welcome!',
      body: 'Thanks for joining Beta Breaker.',
    });

    expect(res.status).toBe(200);
    const result = await res.json();
    createdNotificationIds.push(result.notification_id);

    expect(result.pushed).toBe(false);
    expect(result.reason).toBe('no_tokens');
  });

  it('general type ignores preferences and always sends', async () => {
    // Even though the user has opted out of "friends", "general" notifications
    // bypass the preference check entirely (TYPE_TO_CATEGORY maps to null).
    // The user also has a push token, so push should be attempted.
    const res = await callDispatchPush(SERVICE_ROLE_KEY, {
      user_id: TEST_USER_WITH_TOKEN_ID,
      type: 'general',
      title: 'Important Announcement',
      body: 'Gym is closed for maintenance tomorrow.',
    });

    expect(res.status).toBe(200);
    const result = await res.json();
    createdNotificationIds.push(result.notification_id);

    expect(result.pushed).toBe(true);
    expect(result.token_count).toBe(1);
  });

  it('returns 400 for missing required fields', async () => {
    // Missing 'type' — should fail validation
    const res = await callDispatchPush(SERVICE_ROLE_KEY, {
      user_id: TEST_USER_WITH_TOKEN_ID,
      title: 'No Type',
      body: 'This should fail.',
    });

    expect(res.status).toBe(400);
    const result = await res.json();
    expect(result.error).toMatch(/type/i);
  });

  it('returns 401 for missing or invalid authorization', async () => {
    // No auth header at all
    const resNoAuth = await callDispatchPush(null, {
      user_id: TEST_USER_WITH_TOKEN_ID,
      type: 'general',
      title: 'No Auth',
      body: 'Should be rejected.',
    });
    expect(resNoAuth.status).toBe(401);

    // Wrong token (a user JWT instead of service_role key)
    const resWrongAuth = await callDispatchPush('some-invalid-token', {
      user_id: TEST_USER_WITH_TOKEN_ID,
      type: 'general',
      title: 'Wrong Auth',
      body: 'Should also be rejected.',
    });
    expect(resWrongAuth.status).toBe(401);
  });
});
