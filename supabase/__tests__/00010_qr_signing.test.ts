/**
 * Integration tests for the sign-qr Edge Function (Step 7.2).
 *
 * These tests call the actual Edge Function via HTTP, just like the mobile
 * app would. They verify:
 *   - Admin role authorization (gym_admin can sign, climber cannot)
 *   - JWT generation (correct claims: sub, gym_id, iat, exp)
 *   - Error handling (401, 403, 404 for various bad requests)
 *
 * TEST ISOLATION:
 * Unlike most integration tests that use BEGIN/ROLLBACK, these tests
 * create PERSISTENT data because the Edge Function makes its own DB
 * connection — it can't see rows inside our test transaction. We create
 * test data in beforeAll and clean up in afterAll.
 *
 * AUTH TOKEN ACQUISITION:
 * We create test users via SQL (with encrypted passwords), then sign them
 * in via the GoTrue API to get real Supabase access tokens. This mirrors
 * exactly how the mobile app authenticates.
 *
 * PREREQUISITES:
 * - Local Supabase running: `npx supabase start`
 * - Edge Function serving: `npx supabase functions serve sign-qr --env-file supabase/.env.local`
 * - Database has been reset: `npx supabase db reset`
 */

import { Client } from 'pg';

// ── Constants ────────────────────────────────────────────────────────
// These are well-known values for the local Supabase development instance.

/** Local Supabase API URL — all services are exposed through this gateway. */
const API_URL = 'http://127.0.0.1:54321';

/**
 * Local Supabase anon key — this is a well-known, non-secret key used
 * for local development. It's the same for every `supabase init` project.
 * Required as the `apikey` header for all Supabase API requests.
 */
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/** Direct URL to the sign-qr Edge Function. */
const FUNCTION_URL = `${API_URL}/functions/v1/sign-qr`;

/** Postgres connection string for direct DB access (setup/cleanup). */
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// ── Test data IDs ────────────────────────────────────────────────────
// Fixed UUIDs for test entities, distinct from seed data to avoid conflicts.

const TEST_GYM_ID = 'f0000000-0000-0000-0000-000000000010';
const TEST_ROUTE_ID = 'f0000000-0000-0000-0000-000000000020';
const TEST_ADMIN_ID = 'f0000000-0000-0000-0000-000000000030';
const TEST_CLIMBER_ID = 'f0000000-0000-0000-0000-000000000040';

const TEST_ADMIN_EMAIL = 'qr-admin@test.local';
const TEST_CLIMBER_EMAIL = 'qr-climber@test.local';
const TEST_PASSWORD = 'password123';

// ── Shared state ─────────────────────────────────────────────────────

let client: Client;
let adminToken: string;
let climberToken: string;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Sign in a user via the GoTrue (Supabase Auth) REST API.
 *
 * This is the same endpoint the Supabase JS client calls internally.
 * We use it directly to get an access_token for our test HTTP requests.
 * The `grant_type=password` flow exchanges email+password for a JWT.
 */
async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(
    `${API_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sign-in failed for ${email}: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Call the sign-qr Edge Function with the given auth token and body.
 * Returns the raw Response for flexible assertion in tests.
 */
async function callSignQr(
  token: string | null,
  body: Record<string, unknown>
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
  };

  // Only include Authorization header if a token is provided.
  // This lets us test the "no auth" scenario.
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ── Setup / Teardown ─────────────────────────────────────────────────

beforeAll(async () => {
  // Connect directly to Postgres to create test data.
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // 1. Create a test gym
  await client.query(`
    INSERT INTO public.gyms (id, name, address, latitude, longitude, default_grade_system)
    VALUES ($1, 'QR Test Gym', '1 Test St', 0, 0, 'v-scale')
    ON CONFLICT (id) DO NOTHING
  `, [TEST_GYM_ID]);

  // 2. Create a test route in that gym
  await client.query(`
    INSERT INTO public.routes (id, gym_id, name, canonical_grade, color, setter_id)
    VALUES ($1, $2, 'QR Test Route', 10, 'red', NULL)
    ON CONFLICT (id) DO NOTHING
  `, [TEST_ROUTE_ID, TEST_GYM_ID]);

  // 3. Create admin user in auth.users (triggers handle_new_user → profile)
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
      '{"display_name": "QR Admin"}'::jsonb,
      '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING
  `, [TEST_ADMIN_ID, TEST_ADMIN_EMAIL, TEST_PASSWORD]);

  // 4. Assign gym_admin role to admin user
  await client.query(`
    INSERT INTO public.user_gym_roles (user_id, gym_id, role)
    VALUES ($1, $2, 'gym_admin')
    ON CONFLICT (user_id, gym_id) DO NOTHING
  `, [TEST_ADMIN_ID, TEST_GYM_ID]);

  // 5. Create regular climber user (no gym role assignment)
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
      '{"display_name": "QR Climber"}'::jsonb,
      '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING
  `, [TEST_CLIMBER_ID, TEST_CLIMBER_EMAIL, TEST_PASSWORD]);

  // 6. Sign in both users to get real access tokens
  adminToken = await signIn(TEST_ADMIN_EMAIL, TEST_PASSWORD);
  climberToken = await signIn(TEST_CLIMBER_EMAIL, TEST_PASSWORD);
}, 30000); // 30s timeout — first GoTrue sign-in can be slow

afterAll(async () => {
  // Clean up in reverse order of creation. CASCADE on auth.users
  // handles profiles, roles, and related rows automatically.
  await client.query('DELETE FROM public.routes WHERE id = $1', [TEST_ROUTE_ID]);
  await client.query('DELETE FROM auth.users WHERE id = $1', [TEST_ADMIN_ID]);
  await client.query('DELETE FROM auth.users WHERE id = $1', [TEST_CLIMBER_ID]);
  await client.query('DELETE FROM public.gyms WHERE id = $1', [TEST_GYM_ID]);
  await client.end();
});

// ── Tests ────────────────────────────────────────────────────────────

describe('sign-qr Edge Function', () => {
  it('admin gets valid signed JWT (200)', async () => {
    // A gym admin calling with a valid route_id should get a 200 response
    // with a signed JWT token string.
    const res = await callSignQr(adminToken, { route_id: TEST_ROUTE_ID });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.token).toBeDefined();
    expect(typeof data.token).toBe('string');

    // JWTs have 3 parts separated by dots: header.payload.signature
    const parts = data.token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('JWT contains correct route_id as sub', async () => {
    // The route_id should be in the `sub` (subject) claim of the JWT.
    // We decode the payload (middle part) to check without verifying
    // the signature — verification is tested in qr-roundtrip.test.ts.
    const res = await callSignQr(adminToken, { route_id: TEST_ROUTE_ID });
    const { token } = await res.json();

    // Decode the JWT payload (base64url → JSON)
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString()
    );

    expect(payload.sub).toBe(TEST_ROUTE_ID);
  });

  it('JWT contains gym_id claim', async () => {
    // The gym_id should be present as a custom claim, matching the
    // gym that owns the route.
    const res = await callSignQr(adminToken, { route_id: TEST_ROUTE_ID });
    const { token } = await res.json();

    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString()
    );

    expect(payload.gym_id).toBe(TEST_GYM_ID);
  });

  it('JWT has iat and exp claims (~30 days apart)', async () => {
    // The token should have issued-at and expiration timestamps.
    // exp should be approximately 30 days (2,592,000 seconds) after iat.
    const res = await callSignQr(adminToken, { route_id: TEST_ROUTE_ID });
    const { token } = await res.json();

    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString()
    );

    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');

    // exp - iat should be ~30 days (2,592,000 seconds).
    // Allow ±1 day tolerance for edge cases in time calculation.
    const thirtyDays = 30 * 24 * 60 * 60;
    const diff = payload.exp - payload.iat;
    expect(diff).toBeGreaterThanOrEqual(thirtyDays - 86400);
    expect(diff).toBeLessThanOrEqual(thirtyDays + 86400);
  });

  it('non-admin user is rejected (403)', async () => {
    // A regular climber (no gym role) should get a 403 Forbidden response.
    // Only gym_admin and super_admin roles can generate QR codes.
    const res = await callSignQr(climberToken, { route_id: TEST_ROUTE_ID });
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error).toMatch(/insufficient permissions/i);
  });

  it('unauthenticated request is rejected (401)', async () => {
    // A request with no Authorization header should get 401.
    const res = await callSignQr(null, { route_id: TEST_ROUTE_ID });
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('non-existent route_id returns 404', async () => {
    // A random UUID that doesn't match any route should get 404.
    const fakeRouteId = 'deadbeef-dead-dead-dead-deaddeadbeef';
    const res = await callSignQr(adminToken, { route_id: fakeRouteId });
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toMatch(/route not found/i);
  });

  it('subsequent calls produce different tokens', async () => {
    // Each call should produce a unique token because the iat (issued-at)
    // timestamp differs by at least 1 second between calls.
    const res1 = await callSignQr(adminToken, { route_id: TEST_ROUTE_ID });
    const { token: token1 } = await res1.json();

    // Small delay to ensure different iat timestamps
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res2 = await callSignQr(adminToken, { route_id: TEST_ROUTE_ID });
    const { token: token2 } = await res2.json();

    // The tokens should be different (different iat → different signature)
    expect(token1).not.toBe(token2);
  });
});
